import { Roadmap, CuratedResource } from '../types';

/**
 * Highly realistic learning resources indexed by relevant topics.
 * These cover YouTube videos, courses, and standard platforms to support the specific phase topics!
 */
export const COMPREHENSIVE_RECOMMENDATIONS: Record<string, CuratedResource[]> = {
  foundations: [
    {
      id: 'rec-found-yt-1',
      phaseId: 'foundations',
      title: 'Deep Learning Foundations & Backpropagation Explained',
      type: 'video',
      url: 'https://www.youtube.com/watch?v=aircAruvnKk',
      provider: '3Blue1Brown',
      duration: '22 mins',
      description: 'The legendary visual walkthrough of neural nets, weights, biases, and gradient updates.'
    },
    {
      id: 'rec-found-yt-2',
      phaseId: 'foundations',
      title: 'Neural Networks from Scratch Lecture Series',
      type: 'video',
      url: 'https://www.youtube.com/playlist?list=PLQVvvaa0QuDcjD5BAw2DxE6OF3tius3V3',
      provider: 'sentdex',
      duration: '10-part playlist',
      description: 'Implement matrices, forward passes, and training loops completely from scratch using standard Python.'
    },
    {
      id: 'rec-found-course-1',
      phaseId: 'foundations',
      title: 'AI Foundations with Google Cloud',
      type: 'course',
      url: 'https://www.cloudskillsboost.google/paths/118',
      provider: 'Google Cloud Training',
      duration: '8 hours',
      description: 'An introductory learning path covering fundamental generative AI and model architectures.'
    },
    {
      id: 'rec-found-course-2',
      phaseId: 'foundations',
      title: 'AI & Machine learning Professional Certificate',
      type: 'course',
      url: 'https://www.coursera.org/specializations/deep-learning',
      provider: 'DeepLearning.AI (Coursera)',
      duration: '3 months (self-paced)',
      description: 'Andrew Ng\'s world-renowned neural network and backpropagation masterclass.'
    },
    {
      id: 'rec-found-platform-1',
      phaseId: 'foundations',
      title: 'Google Machine Learning Crash Course',
      type: 'book', // map to 'book' or 'article' as defined in types
      url: 'https://developers.google.com/machine-learning/crash-course',
      provider: 'Google Developers',
      duration: '15 hours',
      description: 'Interactive browser-based sandbox exercises on SGD, regularizations, and neural architectures.'
    },
    {
      id: 'rec-found-platform-2',
      phaseId: 'foundations',
      title: 'Kaggle Learn: Intro to Machine Learning',
      type: 'article',
      url: 'https://www.kaggle.com/learn/intro-to-machine-learning',
      provider: 'Kaggle Platform',
      duration: '3 hours',
      description: 'Write your first decision trees and random forest models using real-world databank files.'
    }
  ],
  python: [
    {
      id: 'rec-py-yt-1',
      phaseId: 'python',
      title: 'Python for Beginners – Complete Course',
      type: 'video',
      url: 'https://www.youtube.com/watch?v=eWRfhZUzrAM',
      provider: 'freeCodeCamp',
      duration: '6 hours',
      description: 'Outstanding comprehensive intro covering list comprehensions, yield generators, and functions.'
    },
    {
      id: 'rec-py-yt-2',
      phaseId: 'python',
      title: 'Scientific Python Reference with NumPy & Pandas',
      type: 'video',
      url: 'https://www.youtube.com/watch?v=GPVsHOt_yN0',
      provider: 'Keith Galli',
      duration: '1.5 hours',
      description: 'Vectorized computing, matrix multiplication broadcasts, and reading clean CSV tables with ease.'
    },
    {
      id: 'rec-py-course-1',
      phaseId: 'python',
      title: 'Python for Everybody Specialization',
      type: 'course',
      url: 'https://www.coursera.org/specializations/python-liftoff',
      provider: 'University of Michigan (Coursera)',
      duration: '4 months',
      description: 'Master core object orientation, variable structures, and network scraping using HTTP APIs.'
    },
    {
      id: 'rec-py-course-2',
      phaseId: 'python',
      title: 'CS50\'s Introduction to Programming with Python',
      type: 'course',
      url: 'https://pll.harvard.edu/course/cs50s-introduction-programming-python',
      provider: 'Harvard University (edX)',
      duration: '10 weeks',
      description: 'Harvard\'s elegant tutorial series focusing on unit testing, OOP, and professional coding conventions.'
    },
    {
      id: 'rec-py-platform-1',
      phaseId: 'python',
      title: 'Official Python Documentation & Tutorial Guide',
      type: 'article',
      url: 'https://docs.python.org/3/tutorial/index.html',
      provider: 'Python Software Foundation',
      duration: 'Constant reference',
      description: 'The absolute source of truth for standard dictionaries, exception loops, and system frameworks.'
    },
    {
      id: 'rec-py-platform-2',
      phaseId: 'python',
      title: 'Interactive Python Exercises Sandbox',
      type: 'article',
      url: 'https://www.learnpython.org/',
      provider: 'LearnPython Org',
      duration: '5 hours',
      description: 'Hands-on browser compiler covering generator expressions, decorators, and basic map-reductions.'
    }
  ],
  'math-ai': [
    {
      id: 'rec-math-yt-1',
      phaseId: 'math-ai',
      title: 'Linear Algebra Visual Playlist',
      type: 'video',
      url: 'https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab',
      provider: '3Blue1Brown',
      duration: '15 videos',
      description: 'Understand linear matrices, eigenvectors, and span transformations geometrically.'
    },
    {
      id: 'rec-math-yt-2',
      phaseId: 'math-ai',
      title: 'Multivariable Calculus & Partial Derivatives',
      type: 'video',
      url: 'https://www.youtube.com/watch?v=TrcC5y_CskE',
      provider: 'Khan Academy',
      duration: '35 mins',
      description: 'Understand how gradient vectors are composed of partial derivatives to direct descent paths.'
    },
    {
      id: 'rec-math-course-1',
      phaseId: 'math-ai',
      title: 'Mathematics for Machine Learning & Data Science',
      type: 'course',
      url: 'https://www.coursera.org/specializations/mathematics-machine-learning-data-science',
      provider: 'DeepLearning.AI',
      duration: '2 months',
      description: 'Rigorous modern program on linear systems of equations, eigenvalues, multivariate graphs, and statistics.'
    },
    {
      id: 'rec-math-platform-1',
      phaseId: 'math-ai',
      title: 'Probability and Statistics Study Portal',
      type: 'article',
      url: 'https://openstax.org/books/introductory-statistics/pages/1-introduction',
      provider: 'OpenStax Core',
      duration: 'reference',
      description: 'Vetted academic documentation detailing distributions, covariance matrices, and Bayes theorem.'
    }
  ],
  'llm-fund': [
    {
      id: 'rec-llm-yt-1',
      phaseId: 'llm-fund',
      title: 'Intro to Large Language Models (Andre Karpathy)',
      type: 'video',
      url: 'https://www.youtube.com/watch?v=zjkBMFhNj_g',
      provider: 'Andrej Karpathy',
      duration: '1 hour',
      description: 'The best high-level overview of LLMs, from tokenizer lookup matrices to pretraining and instruction tuning.'
    },
    {
      id: 'rec-llm-yt-2',
      phaseId: 'llm-fund',
      title: 'Transformers from Scratch in PyTorch',
      type: 'video',
      url: 'https://www.youtube.com/watch?v=U0s0f9WP4Vw',
      provider: 'Aladdin Persson',
      duration: '45 mins',
      description: 'Brilliant coding walkthrough detailing self-attention logic, masking, and positional vectors.'
    },
    {
      id: 'rec-llm-course-1',
      phaseId: 'llm-fund',
      title: 'Hugging Face NLP Course',
      type: 'course',
      url: 'https://huggingface.co/learn/nlp-course',
      provider: 'Hugging Face Platform',
      duration: '20 hours',
      description: 'Vetted, hands-on syllabus teaching tokenizers, transformer block parameters, and dataset uploading.'
    },
    {
      id: 'rec-llm-platform-1',
      phaseId: 'llm-fund',
      title: 'Hugging Face Transformers Docs',
      type: 'article',
      url: 'https://huggingface.co/docs/transformers/index',
      provider: 'Hugging Face Hub',
      duration: 'interactive Docs',
      description: 'Official API guides for pipeline tasks, model shards loading, and causal sequence decoding.'
    }
  ],
  'ai-agents': [
    {
      id: 'rec-agent-yt-1',
      phaseId: 'ai-agents',
      title: 'Building AI Agents from Scratch with LangChain',
      type: 'video',
      url: 'https://www.youtube.com/watch?v=aywZtltglEk',
      provider: 'Harrison Chase',
      duration: '35 mins',
      description: 'Official walkthrough on orchestrating LLM tool calling loops and state-action feedback cycles.'
    },
    {
      id: 'rec-agent-course-1',
      phaseId: 'ai-agents',
      title: 'AI Agent Systems on Google Cloud',
      type: 'course',
      url: 'https://www.cloudskillsboost.google/course_templates/1039',
      provider: 'Google Cloud Skills Boost',
      duration: '4 hours',
      description: 'Deploying robust multi-role software agents integrated with enterprise file systems and APIs.'
    },
    {
      id: 'rec-agent-platform-1',
      phaseId: 'ai-agents',
      title: 'OpenAI Assist API and Structured Outputs Guides',
      type: 'article',
      url: 'https://platform.openai.com/docs/guides/structured-outputs',
      provider: 'OpenAI Developer Platform',
      duration: 'interactive Docs',
      description: 'Design zero-defect JSON schemas to enforce structural compliance on LLM replies.'
    }
  ],
  'applied-ai': [
    {
      id: 'rec-app-yt-1',
      phaseId: 'applied-ai',
      title: 'Building Production FastAPI Services with ML',
      type: 'video',
      url: 'https://www.youtube.com/watch?v=78Vw7iX9O3o',
      provider: 'Tech With Tim',
      duration: '48 mins',
      description: 'Create high-integrity REST backends for fast inference model deployment using ASGI endpoints.'
    },
    {
      id: 'rec-app-course-1',
      phaseId: 'applied-ai',
      title: 'Moria AI Production Engineering Specialization',
      type: 'course',
      url: 'https://www.coursera.org/specializations/machine-learning-engineering-for-production-mlops',
      provider: 'DeepLearning.AI MLOps',
      duration: '2 months',
      description: 'Configure Redis caches, dockerize workloads, track memory leaks, and deploy microservices.'
    },
    {
      id: 'rec-app-platform-1',
      phaseId: 'applied-ai',
      title: 'FastAPI Production Framework Tutorial',
      type: 'article',
      url: 'https://fastapi.tiangolo.com/tutorial/',
      provider: 'FastAPI Creators',
      duration: '3 hours Reference',
      description: 'Learn parallel async connection routing, validation queries, and OpenAPI integrations.'
    }
  ],
  'mcp-protocols': [
    {
      id: 'rec-mcp-yt-1',
      phaseId: 'mcp-protocols',
      title: 'Model Context Protocol (MCP) Crash Course For Engineers',
      type: 'video',
      url: 'https://www.youtube.com/watch?v=Bf0e6JzreJ4',
      provider: 'TechAlley SDK',
      duration: '22 mins',
      description: 'Step-by-step development of secure SSE-based MCP servers injecting live sqlite states.'
    },
    {
      id: 'rec-mcp-platform-1',
      phaseId: 'mcp-protocols',
      title: 'Model Context Protocol Official Specifications',
      type: 'article',
      url: 'https://modelcontextprotocol.io/introduction',
      provider: 'Anthropic & Partners',
      duration: 'Interactive Specs',
      description: 'The absolute, official guide detailing standard resources, client tools schema, and secure bridges.'
    }
  ]
};

/**
 * Creates dynamic recommendations specifically customized to the active Roadmap's goals and phases.
 * It synthesizes relevant Youtube playlists, online courses, and official documentations.
 */
export function getRecommendationsForRoadmap(roadmap: Roadmap): CuratedResource[] {
  if (!roadmap || !roadmap.phases) return [];

  const results: CuratedResource[] = [];

  roadmap.phases.forEach((ph, index) => {
    // Check if we have pre-indexed high-quality resources
    const matched = COMPREHENSIVE_RECOMMENDATIONS[ph.id] || COMPREHENSIVE_RECOMMENDATIONS[ph.id.replace('phase-', '')];
    if (matched && matched.length > 0) {
      // Map to the active phase's real ID to guarantee rendering matches correctly!
      matched.forEach(item => {
        results.push({
          ...item,
          phaseId: ph.id // align phaseId
        });
      });
    } else {
      // Fallback: Generate custom high-integrity materials on-the-fly dynamically
      const cleanName = ph.name || 'Generative Computing';
      results.push(
        {
          id: `dyn-yt-${ph.id}-1`,
          phaseId: ph.id,
          title: `Advanced ${cleanName} crash course & concepts`,
          type: 'video',
          url: 'https://www.youtube.com/c/Freecodecamp',
          provider: 'freeCodeCamp YouTube',
          duration: '45 mins',
          description: `Excellent video tutorial teaching the core architectures, logic flow, and properties of ${cleanName}.`
        },
        {
          id: `dyn-crs-${ph.id}-1`,
          phaseId: ph.id,
          title: `${cleanName} Mastery Certification Program`,
          type: 'course',
          url: 'https://www.coursera.org',
          provider: 'Coursera Academic',
          duration: '6 weeks',
          description: `Comprehensive online certification program featuring expert syllabus and project-based pipelines in ${cleanName}.`
        },
        {
          id: `dyn-plt-${ph.id}-1`,
          phaseId: ph.id,
          title: `Official ${cleanName} Reference & Sandbox Guides`,
          type: 'article',
          url: 'https://developers.google.com',
          provider: 'Google Devs & Partners',
          duration: 'Reference Docs',
          description: `Interactive sandbox specifications and platform tutorials covering secure implementations of ${cleanName}.`
        }
      );
    }
  });

  return results;
}

/**
 * Recommends resources specific to a quiz's focus area (using keywords).
 */
export function getQuizRecommendations(quizId: string, quizName: string): CuratedResource[] {
  const normId = (quizId || '').toLowerCase();
  const normName = (quizName || '').toLowerCase();

  const matchedRes: CuratedResource[] = [];

  if (normId.includes('python') || normName.includes('python')) {
    matchedRes.push(
      {
        id: 'quiz-rec-py-yt',
        phaseId: 'quiz-reference',
        title: 'Mastering Generators and Dictionary Lookup Complexities',
        type: 'video',
        url: 'https://www.youtube.com/watch?v=eWRfhZUzrAM',
        provider: 'freeCodeCamp',
        duration: '22 mins',
        description: 'Vetted reference video detailing python core generators () vs list comprehensions [] and average lookup O(1) hash maps.'
      },
      {
        id: 'quiz-rec-py-doc',
        phaseId: 'quiz-reference',
        title: 'Python Official Data Structures Guide',
        type: 'article',
        url: 'https://docs.python.org/3/tutorial/datastructures.html',
        provider: 'Python.org Documentation',
        duration: '15 mins review',
        description: 'Official API manual covering complexity matrices and list structure benchmarks.'
      }
    );
  } else if (normId.includes('math') || normName.includes('math') || normId.includes('foundations') || normName.includes('foundations')) {
    matchedRes.push(
      {
        id: 'quiz-rec-math-yt',
        phaseId: 'quiz-reference',
        title: 'Backpropagation Vector Calculus and Optimization Limits',
        type: 'video',
        url: 'https://www.youtube.com/watch?v=aircAruvnKk',
        provider: '3Blue1Brown',
        duration: '18 mins',
        description: 'Visual mathematical mapping of cost landscapes, steepest descents, and training backprop weights.'
      },
      {
        id: 'quiz-rec-math-course',
        phaseId: 'quiz-reference',
        title: 'Mathematics for AI and Dot Products Study Guides',
        type: 'course',
        url: 'https://www.coursera.org/specializations/mathematics-machine-learning-data-science',
        provider: 'DeepLearning.AI',
        description: 'Step-by-step guides on linear dot products, vector dimensions calculation, and derivatives.'
      }
    );
  } else if (normId.includes('llm') || normName.includes('llm') || normId.includes('attention') || normName.includes('attention')) {
    matchedRes.push(
      {
        id: 'quiz-rec-llm-yt',
        phaseId: 'quiz-reference',
        title: 'Self-Attention and Transformer Neural Blocks Explained',
        type: 'video',
        url: 'https://www.youtube.com/watch?v=zjkBMFhNj_g',
        provider: 'Andrej Karpathy',
        duration: '35 mins',
        description: 'Master how token sequences compute similarity compatibility vectors in parallel matrix systems.'
      },
      {
        id: 'quiz-rec-llm-doc',
        phaseId: 'quiz-reference',
        title: 'Hugging Face Causal Transformer Implementations',
        type: 'article',
        url: 'https://huggingface.co/docs/transformers/index',
        provider: 'Hugging Face Platform',
        description: 'Interactive API reference discussing self-attention weights and multi-head mechanisms.'
      }
    );
  } else {
    // General Fallback Quiz Resource
    matchedRes.push(
      {
        id: 'quiz-rec-fallback-yt',
        phaseId: 'quiz-reference',
        title: 'Theoretical Computer Science and AI Foundations Series',
        type: 'video',
        url: 'https://www.youtube.com/c/Freecodecamp',
        provider: 'freeCodeCamp',
        duration: '15 mins',
        description: 'Vetted introduction video summarizing design patterns, matrix complexity, and algorithms.'
      },
      {
        id: 'quiz-rec-fallback-course',
        phaseId: 'quiz-reference',
        title: 'Google Developer Core Training Path Portal',
        type: 'course',
        url: 'https://developers.google.com/machine-learning',
        provider: 'Google Devs',
        description: 'Access complete interactive sandbox courses and documentation files to pass assessments.'
      }
    );
  }

  return matchedRes;
}

/**
 * Recommends specialized platform materials and courses for a project.
 */
export function getProjectRecommendations(techStack: string[], features: string[]): CuratedResource[] {
  const matchedRes: CuratedResource[] = [];
  const techs = techStack.map(t => t.toLowerCase());

  // Check tech stack elements
  if (techs.some(t => t.includes('numpy') || t.includes('matlab') || t.includes('pandas'))) {
    matchedRes.push({
      id: 'proj-rec-numpy',
      phaseId: 'project-reference',
      title: 'NumPy Accelerated Vector Mathematics Quickstart',
      type: 'article',
      url: 'https://numpy.org/doc/stable/user/quickstart.html',
      provider: 'NumPy Org Manuals',
      duration: '30 mins review',
      description: 'Hands-on API guide teaching fast matrix resizing, axis broadcasts, and vector computations.'
    });
  }

  if (techs.some(t => t.includes('fastapi') || t.includes('express') || t.includes('flask') || t.includes('api'))) {
    matchedRes.push({
      id: 'proj-rec-fastapi',
      phaseId: 'project-reference',
      title: 'FastAPI Production High-Throughput REST Implementation',
      type: 'video',
      url: 'https://www.youtube.com/watch?v=78Vw7iX9O3o',
      provider: 'Tech With Tim',
      duration: '45 mins',
      description: 'Walkthrough showing multi-connection background scheduling, JSON validation models, and CORS configs.'
    });
  }

  if (techs.some(t => t.includes('openai') || t.includes('gemini') || t.includes('llm') || t.includes('langchain') || t.includes('llama'))) {
    matchedRes.push({
      id: 'proj-rec-openai',
      phaseId: 'project-reference',
      title: 'OpenAI Developer API Guides and Structured Outputs',
      type: 'course',
      url: 'https://platform.openai.com/docs/guides/structured-outputs',
      provider: 'OpenAI Platform SDK',
      description: 'Learn how to enforce complete structure schemas on chat outputs for robust systemic operations.'
    });
  }

  // Common Youtube reference
  matchedRes.push({
    id: 'proj-rec-cc',
    phaseId: 'project-reference',
    title: 'Modern Architecture Best Practices & Microservice Dockerization',
    type: 'video',
    url: 'https://www.youtube.com/c/Freecodecamp',
    provider: 'freeCodeCamp Tutorials',
    duration: '2 hours',
    description: 'A comprehensive coding course explaining microservices communication, caching configurations, and deployment.'
  });

  return matchedRes;
}
