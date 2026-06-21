# Multi-Roadmap Implementation - Remaining Steps

## ✅ Completed:
1. Backend migration support for old single roadmap → roadmaps array
2. GET /api/roadmaps endpoint
3. DELETE /api/roadmaps/:id endpoint
4. RoadmapsList component created

## 🔄 Remaining Frontend Changes in App.tsx:

### 1. Add State for Selected Roadmap View
```typescript
const [selectedRoadmapId, setSelectedRoadmapId] = useState<string | null>(null);
```

### 2. Add Delete Handler
```typescript
const handleDeleteRoadmap = async (id: string) => {
  try {
    const response = await fetch(`/api/roadmaps/${id}?userEmail=${getStoredUserEmail()}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      setRoadmaps(prev => prev.filter(r => r.id !== id));
      if (activeRoadmapId === id) {
        setActiveRoadmapId(roadmaps[0]?.id || '');
      }
      if (selectedRoadmapId === id) {
        setSelectedRoadmapId(null);
      }
    }
  } catch (err) {
    console.error('Failed to delete roadmap:', err);
  }
};
```

### 3. Update roadmaps tab rendering logic:

```typescript
case 'roadmaps':
  // If no roadmap selected, show list
  if (!selectedRoadmapId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">My Roadmaps</h2>
            <p className="text-sm text-slate-600 mt-1">
              Manage your learning paths
            </p>
          </div>
        </div>

        <RoadmapsList
          roadmaps={roadmaps}
          onSelectRoadmap={(id) => {
            setSelectedRoadmapId(id);
            setActiveRoadmapId(id);
          }}
          onDeleteRoadmap={handleDeleteRoadmap}
        />

        {/* Generate New Button */}
        <button
          onClick={() => setShowGenerator(true)}
          className="w-full py-4 px-6 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-purple-500 to-blue-600 hover:brightness-110 transition-all flex items-center justify-center gap-2"
        >
          <Sparkles className="w-5 h-5" />
          <span>Generate New Roadmap</span>
          <PlusCircle className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // If roadmap selected, show detail view with back button
  const selectedRoadmap = roadmaps.find(r => r.id === selectedRoadmapId);
  if (!selectedRoadmap) {
    setSelectedRoadmapId(null);
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => setSelectedRoadmapId(null)}
        className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-semibold"
      >
        <ArrowLeft className="w-4 h-4" />
        All Roadmaps
      </button>

      {/* Existing roadmap detail tabs */}
      {roadmapDetailTab === 'resources' && <ResourcesTab roadmap={selectedRoadmap} />}
      {roadmapDetailTab === 'quiz' && <QuizTab roadmap={selectedRoadmap} onAddXp={handleAddXp} />}
      {roadmapDetailTab === 'projects' && <ProjectsTab roadmap={selectedRoadmap} onAddXp={handleAddXp} />}
      {roadmapDetailTab === 'insights' && <AIInsightsTab roadmap={selectedRoadmap} profile={profile} />}
      {roadmapDetailTab === 'roadmap' && (
        <>
          <RoadmapHero roadmap={selectedRoadmap} />
          {/* ... AI Mentor Analysis and Tree */}
        </>
      )}
    </div>
  );
```

### 4. Import ArrowLeft icon
```typescript
import { ArrowLeft } from 'lucide-react';
```

### 5. Import RoadmapsList
```typescript
import { RoadmapsList } from './components/RoadmapsList';
```

### 6. Update handleGenerateRoadmap to reset selectedRoadmapId
After successful generation:
```typescript
setSelectedRoadmapId(newRoadmap.id);
```

## Testing Checklist:
- [ ] Can view list of all roadmaps
- [ ] Can click a roadmap card to view details
- [ ] Can delete a roadmap (with confirmation)
- [ ] Can navigate back from detail to list
- [ ] New roadmaps are added to the list (not replacing)
- [ ] Old users with single roadmap get migrated automatically
- [ ] All tabs work on selected roadmap
- [ ] Lesson completion updates correct roadmap

## Commit Message:
```
feat: multi-roadmap support - list, create, delete

- Add GET /api/roadmaps and DELETE /api/roadmaps/:id endpoints
- Migrate old single roadmap data to roadmaps array
- Create RoadmapsList component with cards and delete buttons
- Add navigation between list and detail views
- Preserve all existing quiz/XP/mentor functionality
```
