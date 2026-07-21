import { Router } from 'express';
import { requireAuth, aiLimiter } from '../lib/middleware';
import { unlockAchievement } from '../lib/db';
import {
  reconstructRoadmapJson,
  getRoadmapsByOwner,
  deleteRoadmap,
  createRoadmapFromJson,
  getUserRoadmapsReconstructed,
  upsertRoadmap,
  upsertResource,
  upsertPhaseProject
} from '../db/schema';
import {
  validateCurriculumQuality,
  validateAndNormalizeCurriculum,
  buildFallbackCurriculum,
  logCurriculumStats,
  CURRICULUM_LIMITS
} from '../lib/curriculum';
import { callOpenRouterChatCompletion, cleanAndParseJSON, sanitizeForPrompt, OPENROUTER_MODELS } from '../lib/ai';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), aiActive: !!process.env.OPENROUTER_API_KEY, aiModel: OPENROUTER_MODELS[0] });
});

// Generate roadmap
router.post('/generate-roadmap', aiLimiter, requireAuth, async (req, res) => {
  const { goal, experienceLevel, weeklyHours, preferredStyle, college, branch, year } = req.body;
  if (!goal) return res.status(400).json({ error: 'Goal is required' });

  const meta = { goal, experienceLevel, weeklyHours, preferredStyle, college, branch, year };
  const universityContext = college && branch && year
    ? `\nLearner is a ${sanitizeForPrompt(year)} student at ${sanitizeForPrompt(college)} studying ${sanitizeForPrompt(branch)}; align topics and ordering with their university syllabus (AKTU where applicable).`
    : '';
  const indiaContext = `\nAudience: Indian college/engineering learners. Flow like a semester (foundations -> core -> applied -> advanced -> specialization), blend theory with heavy coding, and include placement skills (DSA, system design, projects). Prefer globally-recognized resources.`;

  const buildRoadmapPrompt = () => `You are a senior curriculum architect. Design a DEEP, degree-level learning curriculum for: "${sanitizeForPrompt(goal)}".
Learner level: "${sanitizeForPrompt(experienceLevel || 'Beginner')}". Pace: ${sanitizeForPrompt(weeklyHours || 5)} hrs/week. Style: "${sanitizeForPrompt(preferredStyle || 'Hands-on')}".${universityContext}${indiaContext}

STRUCTURE (mandatory, never under-deliver):
- ${CURRICULUM_LIMITS.minPhases}-${CURRICULUM_LIMITS.maxPhases} phases; difficulty rises monotonically beginner -> intermediate -> advanced -> expert.
- ${CURRICULUM_LIMITS.minModulesPerPhase}-${CURRICULUM_LIMITS.maxModulesPerPhase} modules per phase (difficulty rises within the phase).
- ${CURRICULUM_LIMITS.minLessonsPerModule}-${CURRICULUM_LIMITS.maxLessonsPerModule} lessons per module (metadata only, NO lesson content/markdown/quizzes).

NAMING & QUALITY:
- Titles must be specific and domain-accurate (e.g. "Implementing Binary Search Trees"), never generic ("Introduction","Basics","Overview","Module 1","Project").
- No duplicate lesson titles or module names anywhere. Descriptions: one concise, concrete sentence.
- Order concepts logically (fundamentals first). Only reference real technologies; do not hallucinate.

LESSON FIELDS: id "les-{phase}-{module}-{n}" (unique); name; description; learningObjectives (2-4 measurable outcomes, each a full phrase); prerequisites (1-3 EARLIER lesson ids forming a real chain, first lesson []); skillTags (2-5 specific lowercase tags like python,numpy,react,sql — never "basics"/"concepts"); difficulty beginner|intermediate|advanced; estimatedMinutes ${CURRICULUM_LIMITS.minLessonMinutes}-${CURRICULUM_LIMITS.maxLessonMinutes}; type "learn"; status "available" for the FIRST lesson only else "locked"; contentStatus "pending".

MODULE FIELDS: id "mod-{phase}-{n}"; name; description; difficulty; estimatedHours 3-8; resources 2-4. Each resource: id, type documentation|video|practice|book, title, provider, url (real https), description. PREFER official documentation, official learning resources, high-quality YouTube playlists, interactive practice platforms, and well-known books; AVOID random blogs. Resources MUST match the module topic.

PHASE FIELDS: id "ph-{n}"; name; description; estimatedHours 10-30; difficulty; skillsCovered (3-6 tags); projects (>=1). Projects reinforce that phase's concepts and get harder across phases using this ladder: mini-exercise -> mini-project -> real-application -> portfolio-project -> capstone. Each project: id, title, difficulty (one ladder value), description (2-3 sentences), techStack (real tools), features (3-6 concrete), progress 0.

Return ONLY a JSON object of this exact shape (one example element shown per array; produce the full required counts):
{"goal":"${sanitizeForPrompt(goal, 120)}","phases":[{"id":"ph-1","name":"...","description":"...","estimatedHours":18,"difficulty":"beginner","skillsCovered":["..."],"modules":[{"id":"mod-1-1","name":"...","description":"...","difficulty":"beginner","estimatedHours":5,"lessons":[{"id":"les-1-1-1","name":"...","description":"...","learningObjectives":["...","..."],"prerequisites":[],"skillTags":["...","..."],"difficulty":"beginner","estimatedMinutes":25,"type":"learn","status":"available","contentStatus":"pending"}],"resources":[{"id":"res-1-1-1","title":"...","type":"documentation","provider":"...","url":"https://...","description":"..."}]}],"projects":[{"id":"proj-1","title":"...","difficulty":"mini-exercise","description":"...","techStack":["..."],"features":["..."],"progress":0}]}]}`;

  const buildCorrectivePrompt = (issues: string[]) => `Your previous curriculum for "${sanitizeForPrompt(goal, 120)}" was REJECTED. Fix EVERY issue below and regenerate the COMPLETE curriculum:
${issues.slice(0, 12).map((i) => `- ${i}`).join('\n')}

Keep the SAME JSON shape and all prior rules: ${CURRICULUM_LIMITS.minPhases}-${CURRICULUM_LIMITS.maxPhases} phases (beginner->expert), ${CURRICULUM_LIMITS.minModulesPerPhase}-${CURRICULUM_LIMITS.maxModulesPerPhase} modules each, ${CURRICULUM_LIMITS.minLessonsPerModule}-${CURRICULUM_LIMITS.maxLessonsPerModule} lessons each, unique specific titles, real backward prerequisite chains, specific skillTags, topic-matched reputable resources, and a rising project ladder (mini-exercise -> mini-project -> real-application -> portfolio-project -> capstone). Return ONLY the JSON object.`;

  const MAX_RETRIES = 2;
  let bestCandidate: { parsed: any; score: number } | null = null;

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const prompt = attempt === 0 ? buildRoadmapPrompt() : buildCorrectivePrompt(bestCandidate ? validateCurriculumQuality(bestCandidate.parsed).issues : []);
      let parsed: any;
      try {
        const response = await callOpenRouterChatCompletion(prompt, { temperature: attempt === 0 ? 0.5 : 0.35, asJSON: true, timeoutMs: 30000, maxTokens: 8000 });
        parsed = cleanAndParseJSON(response, '{}');
      } catch (genErr: any) {
        console.warn(`[Roadmap] Generation attempt ${attempt + 1} failed:`, genErr.message);
        continue;
      }

      if (!parsed?.phases || !Array.isArray(parsed.phases) || parsed.phases.length === 0) {
        console.warn(`[Roadmap] Attempt ${attempt + 1} returned no usable phases.`);
        continue;
      }

      const quality = validateCurriculumQuality(parsed);
      console.log(`[Roadmap] Attempt ${attempt + 1} quality score ${quality.score}/100 (${quality.issues.length} issue(s)).`);
      if (!bestCandidate || quality.score > bestCandidate.score) bestCandidate = { parsed, score: quality.score };

      if (quality.ok) {
        const normalized = validateAndNormalizeCurriculum(parsed, meta);
        logCurriculumStats('AI-Generated', normalized);
        return res.json(normalized);
      }
      if (attempt < MAX_RETRIES) console.warn(`[Roadmap] Retrying with corrective prompt. Issues: ${quality.issues.slice(0, 5).join('; ')}`);
    }

    if (bestCandidate && bestCandidate.score >= 60 && Array.isArray(bestCandidate.parsed.phases)) {
      console.warn(`[Roadmap] All retries had issues; using best candidate (score ${bestCandidate.score}) after normalization.`);
      const normalized = validateAndNormalizeCurriculum(bestCandidate.parsed, meta);
      logCurriculumStats('AI-Best-Candidate', normalized);
      return res.json(normalized);
    }

    throw new Error('All generation attempts failed the quality gate');
  } catch (error: any) {
    let readableError = error.message || String(error);
    try { const pe = JSON.parse(error.message); if (pe?.error?.message) readableError = pe.error.message; } catch (_) {}
    console.error('[Roadmap] Generation failed, using offline fallback:', readableError);
    const fallbackRoadmap = buildFallbackCurriculum(meta);
    logCurriculumStats('AI-Fallback', fallbackRoadmap);
    return res.json(fallbackRoadmap);
  }
});

// Get all roadmaps for a user
router.get('/roadmaps', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail!;
  try {
    const roadmaps = await getUserRoadmapsReconstructed(userEmail);
    return res.json(roadmaps);
  } catch (error) {
    console.error('Get roadmaps error:', error);
    return res.json([]);
  }
});

// Get single roadmap
router.get('/roadmaps/:roadmapId', requireAuth, async (req, res) => {
  const { roadmapId } = req.params;
  const userEmail = req.session.userEmail!;
  try {
    const roadmap = await reconstructRoadmapJson(roadmapId);
    if (!roadmap) return res.status(404).json({ error: 'Roadmap not found' });

    const workspaceRoadmap = {
      ...roadmap,
      phases: roadmap.phases.map((phase: any) => ({
        ...phase,
        levels: phase.levels?.map((level: any) => ({
          ...level,
          topics: level.lessons?.map((lesson: any) => ({
            id: lesson.id, name: lesson.name, type: lesson.type,
            status: lesson.status, xpReward: lesson.xpReward, estimatedTime: lesson.estimatedMinutes ?? 15
          }))
        }))
      }))
    };
    return res.json({ roadmap: workspaceRoadmap });
  } catch (error) {
    console.error('Get roadmap error:', error);
    return res.status(500).json({ error: 'Failed to load roadmap' });
  }
});

// Delete roadmap
router.delete('/roadmaps/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userEmail = req.session.userEmail!;
  try {
    const owned = await getRoadmapsByOwner(userEmail);
    if (!owned.some((r: any) => r.id === id)) return res.status(404).json({ error: 'Roadmap not found' });
    const deleted = await deleteRoadmap(id);
    if (deleted === 0) return res.status(404).json({ error: 'Roadmap not found' });
    return res.json({ success: true, deletedId: id });
  } catch (error) {
    console.error('Delete roadmap error:', error);
    return res.status(500).json({ error: 'Failed to delete roadmap. Database unavailable.' });
  }
});

// Create roadmap
router.post('/roadmaps', requireAuth, async (req, res) => {
  const userEmail = req.session.userEmail!;
  const roadmap = req.body;
  if (!roadmap || !roadmap.id || !roadmap.goal) return res.status(400).json({ error: 'Valid roadmap object with id and goal is required' });
  try {
    // Check BEFORE inserting so we know if this is the user's first roadmap.
    const existingBefore = await getRoadmapsByOwner(userEmail);
    await createRoadmapFromJson(userEmail, roadmap);
    const saved = await reconstructRoadmapJson(roadmap.id);

    // Unlock "Roadmap Builder" on first roadmap creation.
    let newAchievement: { id: string; name: string; icon: string; xpReward: number } | null = null;
    if (existingBefore.length === 0) {
      newAchievement = await unlockAchievement(userEmail, 'ach-3');
    }

    return res.json({ success: true, roadmap: saved || roadmap, newAchievement });
  } catch (error) {
    console.error('Create roadmap error:', error);
    return res.status(500).json({ error: 'Failed to create roadmap' });
  }
});

// Update roadmap
router.post('/update-roadmap', requireAuth, async (req, res) => {
  const { roadmapId, updates } = req.body;
  const userEmail = req.session.userEmail!;
  if (!roadmapId || !updates || typeof updates !== 'object') return res.status(400).json({ error: 'roadmapId and updates object are required' });

  const ROADMAP_MUTABLE_FIELDS = new Set(['title', 'goal', 'progressPercent', 'totalXp', 'lessonsCompleted', 'hoursRemaining', 'phases', 'resources', 'projects', 'quizzes']);
  const forbidden = Object.keys(updates).filter((k) => !ROADMAP_MUTABLE_FIELDS.has(k));
  if (forbidden.length > 0) return res.status(400).json({ error: `Cannot update field(s): ${forbidden.join(', ')}` });

  try {
    const existing = await getRoadmapsByOwner(userEmail);
    if (!existing.some((r: any) => r.id === roadmapId)) return res.status(404).json({ error: 'Roadmap not found' });

    const roadmapPatch: any = {};
    for (const key of Object.keys(updates)) {
      const uVal = (updates as any)[key];
      switch (key) {
        case 'title': roadmapPatch.title = uVal; break;
        case 'goal': roadmapPatch.goal = uVal; break;
        case 'progressPercent': roadmapPatch.progressPercent = uVal; break;
        case 'totalXp': roadmapPatch.totalXp = uVal; break;
        case 'lessonsCompleted': roadmapPatch.lessonsCompleted = uVal; break;
        case 'hoursRemaining': roadmapPatch.hoursRemaining = uVal; break;
        case 'status': roadmapPatch.status = uVal; break;
        case 'resources':
          for (const r of Array.isArray(uVal) ? uVal : []) {
            await upsertResource({ id: r.id || `res-${roadmapId}-${r.title}`, roadmapId, phaseId: r.phaseId ?? null, moduleId: r.moduleId ?? null, title: r.title, type: r.type, provider: r.provider ?? null, url: r.url ?? null, description: r.description ?? null, duration: r.duration ?? null });
          }
          break;
        case 'projects':
          for (const p of Array.isArray(uVal) ? uVal : []) {
            await upsertPhaseProject({ id: p.id || `proj-${roadmapId}-${p.title}`, roadmapId, phaseId: p.phaseId ?? null, title: p.title, difficulty: p.difficulty, description: p.description ?? null, techStack: p.techStack, features: p.features, githubUrl: p.githubUrl ?? null, progress: p.progress });
          }
          break;
      }
    }

    if (Object.keys(roadmapPatch).length > 0) {
      const existingRoadmap = existing.find((r: any) => r.id === roadmapId);
      await upsertRoadmap({ id: roadmapId, ownerEmail: userEmail.toLowerCase(), goal: existingRoadmap?.goal || roadmapPatch.goal || '', ...roadmapPatch });
    }

    const updated = await reconstructRoadmapJson(roadmapId);
    return res.json({ success: true, roadmap: updated });
  } catch (error) {
    console.error('Update roadmap error:', error);
    return res.status(500).json({ error: 'Failed to update roadmap' });
  }
});

// Validate progression
router.post('/validate-progression', requireAuth, async (req, res) => {
  const { roadmap } = req.body;
  if (!roadmap) return res.status(400).json({ error: 'Roadmap data is required' });

  const validation = { hasGaps: false, gaps: [], prerequisitesMet: true, missingPrerequisites: [], quizMatchesContent: true, mismatchedQuizzes: [] };

  if (roadmap?.phases) {
    const allLessons: any[] = [];
    for (const phase of roadmap.phases || []) {
      for (const level of phase.levels || []) {
        for (const lesson of level.lessons || []) {
          allLessons.push({ ...lesson, phaseId: phase.id, levelId: level.id });
        }
      }
    }

    const completedBeforeAvailable = (lesson: any, idx: number) =>
      allLessons.slice(0, idx).some((l, i) => allLessons[i].status === 'completed' && lesson.status === 'available');

    const gaps: any[] = [];
    const missingPrerequisites: string[] = [];

    allLessons.forEach((lesson, idx) => {
      if (lesson.status === 'locked' && completedBeforeAvailable(lesson, idx)) gaps.push({ lessonId: lesson.id, reason: 'Locked lesson after completed lessons' });
      if (lesson.type === 'quiz' && lesson.status === 'available') {
        const hasLearnBefore = allLessons.slice(0, idx).some(l => l.type === 'learn' && l.status === 'completed');
        if (!hasLearnBefore) gaps.push({ lessonId: lesson.id, reason: 'Quiz unlocked without prior learning' });
      }
      if (lesson.prerequisites) {
        lesson.prerequisites.forEach((prereq: string) => {
          const prereqExists = allLessons.some(l => l.id === prereq);
          const prereqCompleted = allLessons.some(l => l.id === prereq && l.status === 'completed');
          if (!prereqExists) missingPrerequisites.push(`${lesson.id}: missing ${prereq}`);
          else if (!prereqCompleted && lesson.status === 'available') missingPrerequisites.push(`${lesson.id}: ${prereq} not completed`);
        });
      }
    });

    (validation as any).hasGaps = gaps.length > 0;
    (validation as any).gaps = gaps;
    (validation as any).prerequisitesMet = missingPrerequisites.length === 0;
    (validation as any).missingPrerequisites = missingPrerequisites;
  }

  return res.json(validation);
});

export default router;
