import { randomUUID } from 'node:crypto';
import { LEARNING_EVENT, LEARNING_EVENT_TYPES } from '../../types';
import type { LearningEventType } from '../../types';

const allowedProperties = new Set(['durationSeconds', 'score', 'attempt', 'totalQuestions', 'quizId', 'resourceId', 'source']);

export function validateLearningEventType(value: unknown): value is LearningEventType {
  return typeof value === 'string' && (LEARNING_EVENT_TYPES as readonly string[]).includes(value);
}

export { LEARNING_EVENT };

export function validateLearningEventProperties(value: unknown): Record<string, string | number | boolean | null> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('properties must be an object');
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 12) throw new Error('Too many event properties');
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of entries) {
    if (!allowedProperties.has(key)) throw new Error(`Unsupported event property: ${key}`);
    if (item === null || typeof item === 'boolean') result[key] = item;
    else if (typeof item === 'string' && item.length <= 200) result[key] = item;
    else if (typeof item === 'number' && Number.isFinite(item) && Math.abs(item) <= 1_000_000) result[key] = item;
    else throw new Error(`Invalid event property: ${key}`);
  }
  return result;
}

export function newLearningEventId(): string { return `evt-${randomUUID()}`; }
