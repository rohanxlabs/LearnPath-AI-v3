import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Target, Clock, BookOpen, Brain } from 'lucide-react';

interface OnboardingPageProps {
  onComplete: (preferences: OnboardingPreferences) => void;
}

export interface OnboardingPreferences {
  learningGoal: string;
  experienceLevel: string;
  weeklyHours: number;
  learningStyle: string;
  college: string;
  branch: string;
  year: string;
}

const experienceLevels = ['Beginner', 'Intermediate', 'Advanced'];
const learningStyles = ['Visual', 'Hands-on', 'Theoretical'];
const colleges = ['Sharda University', 'Galgotias University', 'AKTU Universities (Other)', 'Other Private University', 'Other State University'];
const branches = ['Computer Science Engineering (CSE)', 'Information Technology (IT)', 'Electronics & Communication (ECE)', 'Mechanical Engineering', 'Civil Engineering', 'Other'];
const years = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

export const OnboardingPage: React.FC<OnboardingPageProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [preferences, setPreferences] = useState<OnboardingPreferences>({
    learningGoal: '',
    experienceLevel: 'Beginner',
    weeklyHours: 5,
    learningStyle: 'Visual',
    college: 'Galgotias University',
    branch: 'Computer Science Engineering (CSE)',
    year: '2nd Year',
  });

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      onComplete(preferences);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const steps = [
    {
      title: 'What do you want to learn?',
      description: 'Tell us your goal and we\'ll create a personalized roadmap.',
      icon: Target,
    },
    {
      title: 'Tell us about your college',
      description: 'We\'ll tailor content to your university\'s syllabus.',
      icon: BookOpen,
    },
    {
      title: 'What\'s your experience level?',
      description: 'This helps us customize the difficulty and pace.',
      icon: Brain,
    },
    {
      title: 'How much time can you dedicate?',
      description: 'We\'ll create a schedule that fits your availability.',
      icon: Clock,
    },
  ];

  const currentStep = steps[step - 1];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md rounded-[24px] bg-[#111111] border border-white/10 p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-500 to-blue-600 flex items-center justify-center">
              <currentStep.icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-white">{currentStep.title}</h2>
              <p className="text-xs text-zinc-400">{currentStep.description}</p>
            </div>
          </div>
          <div className="text-xs text-zinc-500">{step}/4</div>
        </div>

        <div className="space-y-6">
          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <label className="block text-[10px] uppercase font-bold text-zinc-400 font-mono mb-2">
                Your Learning Goal
              </label>
              <input
                type="text"
                value={preferences.learningGoal}
                onChange={(e) => setPreferences({ ...preferences, learningGoal: e.target.value })}
                placeholder="e.g., Full Stack Web Development"
                className="w-full px-4 py-3 bg-[#0A0A0A] border border-white/5 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
              />
              <p className="text-xs text-zinc-500 mt-2">
                Be specific for better recommendations. Try "React with TypeScript" or "Python for Data Science".
              </p>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 font-mono mb-2">
                  Your College
                </label>
                <select
                  value={preferences.college}
                  onChange={(e) => setPreferences({ ...preferences, college: e.target.value })}
                  className="w-full px-4 py-3 bg-[#0A0A0A] border border-white/5 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  {colleges.map((college) => (
                    <option key={college} value={college}>{college}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 font-mono mb-2">
                  Your Branch
                </label>
                <select
                  value={preferences.branch}
                  onChange={(e) => setPreferences({ ...preferences, branch: e.target.value })}
                  className="w-full px-4 py-3 bg-[#0A0A0A] border border-white/5 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  {branches.map((branch) => (
                    <option key={branch} value={branch}>{branch}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 font-mono mb-2">
                  Current Year
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {years.map((year) => (
                    <button
                      key={year}
                      onClick={() => setPreferences({ ...preferences, year: year })}
                      className={`py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                        preferences.year === year
                          ? 'bg-gradient-to-br from-purple-500 to-blue-600 text-white'
                          : 'bg-[#0A0A0A] text-zinc-400 border border-white/5 hover:text-white'
                      }`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 font-mono mb-2">
                  Experience Level
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {experienceLevels.map((level) => (
                    <button
                      key={level}
                      onClick={() => setPreferences({ ...preferences, experienceLevel: level })}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                        preferences.experienceLevel === level
                          ? 'bg-gradient-to-br from-purple-500 to-blue-600 text-white'
                          : 'bg-[#0A0A0A] text-zinc-400 border border-white/5 hover:text-white'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 font-mono mb-2">
                  Learning Style
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {learningStyles.map((style) => (
                    <button
                      key={style}
                      onClick={() => setPreferences({ ...preferences, learningStyle: style })}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                        preferences.learningStyle === style
                          ? 'bg-gradient-to-br from-purple-500 to-blue-600 text-white'
                          : 'bg-[#0A0A0A] text-zinc-400 border border-white/5 hover:text-white'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <label className="block text-[10px] uppercase font-bold text-zinc-400 font-mono mb-2">
                Weekly Study Hours
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={preferences.weeklyHours}
                  onChange={(e) => setPreferences({ ...preferences, weeklyHours: parseInt(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-lg font-bold text-purple-400 w-16">{preferences.weeklyHours}h</span>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                Recommended: 5-10 hours for optimal progress without burnout.
              </p>
            </motion.div>
          )}
        </div>

        <div className="flex gap-3 mt-8">
          {step > 1 && (
            <button
              onClick={handleBack}
              className="flex-1 py-2.5 font-bold text-xs text-zinc-400 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all"
            >
              Back
            </button>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleNext}
            disabled={step === 1 && !preferences.learningGoal}
            className="flex-1 py-2.5 font-bold text-xs text-white bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {step < 4 ? 'Next' : 'Create My Roadmap'}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default OnboardingPage;