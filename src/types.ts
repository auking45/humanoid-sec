/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Theme {
  id: string;
  name: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  description?: string;
  implementationGuide?: string;
  category: 'Network' | 'Physical' | 'Software' | 'Access' | 'System' | 'OS' | 'Cloud' | 'Audit';
  weight: number; // 1 to 5
}

export interface Checklist {
  id: string;
  title: string;
  description: string;
  items: ChecklistItem[];
}

export interface ChecklistResult {
  checked: boolean;
  justification?: string;
  reviewStatus?: 'pending' | 'approved' | 'rejected';
}

export interface Target {
  id: string;
  name: string;
  type: string;
  description: string;
  checklistResults: Record<string, Record<string, ChecklistResult>>; // checklistId -> itemId -> result
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
