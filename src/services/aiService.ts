/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";
import { Checklist, RiskAnalysis, Target, AIModel } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeRobotRisk(
  target: Target,
  checklist: Checklist,
  model: AIModel = 'gemini-3-flash-preview'
): Promise<RiskAnalysis> {
  const completedItems = checklist.items.filter(
    (item) => target.checklistResults[checklist.id]?.[item.id]
  );
  const missingItems = checklist.items.filter(
    (item) => !target.checklistResults[checklist.id]?.[item.id]
  );

  const prompt = `
    Analyze the security risk for the following robot:
    Target Name: ${target.name}
    Target Type: ${target.type}
    Description: ${target.description}

    Security Checklist: ${checklist.title}
    Completed Items: ${completedItems.map(i => i.text).join(', ')}
    Missing/Failed Items: ${missingItems.map(i => i.text).join(', ')}

    Please provide a security risk analysis in JSON format with the following structure:
    {
      "summary": "A brief overview of the security posture",
      "recommendations": ["list of specific actions to improve security"],
      "severity": "Low" | "Medium" | "High" | "Critical"
    }
  `;

  // --- Gemini: Direct Frontend Call ---
  if (model === 'gemini-3-flash-preview') {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const result = JSON.parse(response.text || "{}");
      return {
        targetId: target.id,
        summary: result.summary || "Analysis failed",
        recommendations: result.recommendations || [],
        severity: result.severity || "Medium",
      };
    } catch (error) {
      console.error("Gemini analysis failed:", error);
      throw error;
    }
  }

  // --- Other Models: Proxy via Backend for Security ---
  try {
    const response = await fetch('/api/ai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model })
    });

    if (!response.ok) throw new Error('Backend AI analysis failed');
    
    const result = await response.json();
    return {
      targetId: target.id,
      summary: result.summary || "Analysis failed",
      recommendations: result.recommendations || [],
      severity: result.severity || "Medium",
    };
  } catch (error) {
    console.error(`${model} analysis failed:`, error);
    return {
      targetId: target.id,
      summary: `Error during ${model} analysis. Please try again later.`,
      recommendations: [],
      severity: "Medium",
    };
  }
}
