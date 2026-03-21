/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ChecklistItem {
  id: string;
  text: string;
  description?: string;
  category: 'Network' | 'Physical' | 'Software' | 'Access Control' | 'System Security' | 'OS Hardening' | 'Cloud Communication' | 'Local Network' | 'Audit Logging';
  weight: number; // 1 to 5
}

export interface Checklist {
  id: string;
  title: string;
  description: string;
  items: ChecklistItem[];
}

export interface Target {
  id: string;
  name: string;
  type: string;
  description: string;
  checklistResults: Record<string, Record<string, boolean>>; // checklistId -> itemId -> completed
  riskScore: number;
  lastAnalyzed: string;
}

export type AIModel = 'gemini-3-flash-preview' | 'gpt-4o' | 'claude-3-5-sonnet';

export interface RiskAnalysis {
  targetId: string;
  summary: string;
  recommendations: string[];
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
}
