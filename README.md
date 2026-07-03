<div align="center">
<img width="1200" height="475" alt="LearnPath AI Banner" src="https://your-banner-url.com/banner.png" />
</div>

# LearnPath AI - Your Personal AI Study Agent

## Problem
Generic AI tools don't know your university syllabus. They give generic advice that doesn't align with what you actually need to study for your exams.

## Solution
An AI agent that builds custom learning roadmaps and quizzes based on your exact curriculum. Tailored specifically for Indian university students following AKTU and other syllabi.

### Features
- 🎯 AI-generated personalized learning roadmaps
- 📝 Automatic quiz generation to test your knowledge
- 🏛️ University-specific content tailored to your college
- 📊 Track your progress with XP and completion metrics
- 💬 AI tutor available 24/7 to answer your questions

## Demo GIFs

![Generate Roadmap](https://your-gif-url.com/generate-roadmap.gif)
*AI generates a custom roadmap based on your goal*

![Take Quiz](https://your-gif-url.com/take-quiz.gif)
*Test your knowledge with AI-generated quizzes*

![Chat with Tutor](https://your-gif-url.com/chat-tutor.gif)
*Get instant help from your AI study agent*

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set up your environment variables in `.env`:
   - `OPENROUTER_API_KEY` - Your OpenRouter API key for AI access
   - `DATABASE_URL` - Your PostgreSQL database URL
   - `SESSION_SECRET` - Random string for session security
3. Run the app:
   `npm run dev`
4. Access the app at http://localhost:5173