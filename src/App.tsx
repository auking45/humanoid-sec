/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Shield,
  LayoutDashboard,
  ClipboardCheck,
  Target as TargetIcon,
  AlertTriangle,
  Plus,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Activity,
  ShieldCheck,
  Trophy,
  CheckCircle2,
  XCircle,
  Search,
  Trash2,
  Brain,
  Sparkles,
  Settings,
  Download,
  HelpCircle,
  BookOpen,
  FileText,
  UploadCloud
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Checklist, Target, RiskAnalysis, AIModel, ChecklistResult, Theme, Guide } from './types';

const THEMES: Theme[] = [
  { id: 'indigo', name: 'Indigo', primary: '#6366F1', primaryDark: '#4F46E5', primaryLight: '#EEF2FF', secondary: '#A855F7' },
  { id: 'ocean', name: 'Ocean', primary: '#3B82F6', primaryDark: '#2563EB', primaryLight: '#EFF6FF', secondary: '#60A5FA' },
  { id: 'cyan', name: 'Cyan', primary: '#06B6D4', primaryDark: '#0891B2', primaryLight: '#ECFEFF', secondary: '#22D3EE' },
  { id: 'teal', name: 'Teal', primary: '#14B8A6', primaryDark: '#0D9488', primaryLight: '#F0FDFA', secondary: '#2DD4BF' },
  { id: 'emerald', name: 'Emerald', primary: '#10B981', primaryDark: '#059669', primaryLight: '#ECFDF5', secondary: '#059669' },
  { id: 'amber', name: 'Amber', primary: '#F59E0B', primaryDark: '#D97706', primaryLight: '#FFFBEB', secondary: '#D97706' },
  { id: 'rose', name: 'Rose', primary: '#F43F5E', primaryDark: '#E11D48', primaryLight: '#FFF1F2', secondary: '#E11D48' },
  { id: 'fuchsia', name: 'Fuchsia', primary: '#D946EF', primaryDark: '#C026D3', primaryLight: '#FDF4FF', secondary: '#E879F9' },
  { id: 'violet', name: 'Violet', primary: '#8B5CF6', primaryDark: '#7C3AED', primaryLight: '#F5F3FF', secondary: '#A78BFA' },
  { id: 'slate', name: 'Slate', primary: '#64748B', primaryDark: '#475569', primaryLight: '#F8FAFC', secondary: '#475569' },
];

import { analyzeRobotRisk } from './services/aiService';
import {
  exportChecklistToMarkdown,
  exportAllChecklistsToMarkdown,
  downloadMarkdown,
  generateChecklistPDF,
  generateAllChecklistsPDF,
  generateTargetSecurityReport
} from './services/reportingService';

const calculateGlobalRiskScore = (results: Record<string, Record<string, any>>, allChecklists: Checklist[]) => {
  if (!results) results = {};
  if (!allChecklists) return 0;
  let totalWeight = 0;
  let failedWeight = 0;

  allChecklists.forEach(cl => {
    const clResults = results[cl.id] || {};
    cl.items.forEach(item => {
      totalWeight += item.weight;
      const res = clResults[item.id];
      const isCompleted = typeof res === 'boolean' ? res : res?.checked;
      const isApproved = typeof res === 'object' ? res?.reviewStatus === 'approved' : false;

      if (!isCompleted && !isApproved) {
        failedWeight += item.weight;
      }
    });
  });

  return totalWeight > 0 ? Math.round((failedWeight / totalWeight) * 100) : 0;
};

const MOCK_CHECKLIST: Checklist = {
  id: 'cl-1',
  title: 'Standard Robot Security Baseline',
  description: 'Essential security controls for autonomous mobile robots.',
  items: [
    { id: 'i1', text: 'Default passwords changed', category: 'Access', weight: 5 },
    { id: 'i2', text: 'Network traffic encrypted (TLS/SSL)', category: 'Network', weight: 4 },
    { id: 'i3', text: 'Physical ports disabled/locked', category: 'Physical', weight: 3 },
    { id: 'i4', text: 'Firmware update mechanism verified', category: 'Software', weight: 4 },
    { id: 'i5', text: 'Emergency stop functionality verified', category: 'Physical', weight: 5 },
    { id: 'i6', text: 'SSH access restricted to specific IPs', category: 'Network', weight: 3 },
  ]
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'checklists' | 'targets' | 'guides' | 'settings'>('dashboard');
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('app-theme');
    return THEMES.find(t => t.id === saved) || THEMES[0];
  });
  const [targets, setTargets] = useState<Target[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTarget, setNewTarget] = useState({ name: '', type: '', description: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [targetChecklistId, setTargetChecklistId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const itemsEndRef = useRef<HTMLDivElement>(null);

  const [selectedChecklist, setSelectedChecklist] = useState<Checklist | null>(null);
  const [showAddChecklistModal, setShowAddChecklistModal] = useState(false);
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [newChecklist, setNewChecklist] = useState<Checklist>({
    id: '',
    title: '',
    description: '',
    items: []
  });

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-primary', currentTheme.primary);
    root.style.setProperty('--color-primary-dark', currentTheme.primaryDark);
    root.style.setProperty('--color-primary-light', currentTheme.primaryLight);
    root.style.setProperty('--color-secondary', currentTheme.secondary);
    localStorage.setItem('app-theme', currentTheme.id);
  }, [currentTheme]);

  const fetchData = useCallback(async () => {
    try {
      const [targetsRes, checklistsRes, guidesRes] = await Promise.all([
        fetch('/api/targets'),
        fetch('/api/checklists'),
        fetch('/api/guides')
      ]);

      if (targetsRes.ok && checklistsRes.ok && guidesRes.ok) {
        const [targetsData, checklistsData, guidesData] = await Promise.all([
          targetsRes.json(),
          checklistsRes.json(),
          guidesRes.json()
        ]);

        const recalculatedTargets = targetsData.map((t: Target) => ({
          ...t,
          riskScore: calculateGlobalRiskScore(t.checklistResults, checklistsData)
        }));

        setTargets(recalculatedTargets);
        setChecklists(checklistsData);
        setGuides(guidesData);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeChecklist = useMemo(() => {
    if (!checklists.length) return null;
    if (targetChecklistId) return checklists.find(c => c.id === targetChecklistId) || checklists[0];
    return checklists[0];
  }, [checklists, targetChecklistId]);

  const filteredTargets = useMemo(() => {
    return targets.filter(t =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [targets, searchQuery]);

  const handleAddTarget = async () => {
    const target: Target = {
      id: `t-${Date.now()}`,
      name: newTarget.name,
      type: newTarget.type,
      description: newTarget.description,
      checklistResults: {},
      riskScore: checklists.length > 0 ? 100 : 0,
      lastAnalyzed: new Date().toISOString().split('T')[0]
    };

    try {
      const response = await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target),
      });
      if (response.ok) {
        setTargets([...targets, target]);
        setShowAddModal(false);
        setNewTarget({ name: '', type: '', description: '' });
      }
    } catch (error) {
      console.error('Failed to add target:', error);
    }
  };

  const handleDeleteTarget = async (id: string) => {
    try {
      const response = await fetch(`/api/targets/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setTargets(targets.filter(t => t.id !== id));
        setSelectedTarget(null);
      }
    } catch (error) {
      console.error('Failed to delete target:', error);
    }
  };

  const handleUpdateTarget = async (updatedTarget: Target) => {
    try {
      const response = await fetch(`/api/targets/${updatedTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTarget),
      });
      if (response.ok) {
        setTargets(targets.map(t => t.id === updatedTarget.id ? updatedTarget : t));
        setSelectedTarget(updatedTarget);
      }
    } catch (error) {
      console.error('Failed to update target:', error);
    }
  };

  const handleImportGuide = async (guide: Guide) => {
    try {
      const response = await fetch('/api/guides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(guide),
      });
      if (response.ok) {
        setGuides([...guides, guide]);
      }
    } catch (error) {
      console.error('Failed to import guide:', error);
    }
  };

  const handleDeleteGuide = async (id: string) => {
    try {
      const response = await fetch(`/api/guides/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setGuides(guides.filter(g => g.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete guide:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium">Loading security data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 glass-sidebar z-50">
        <div className="p-6 flex items-center gap-3 border-b border-white/10">
          <div className="bg-gradient-to-br from-primary to-secondary p-2 rounded-xl shadow-lg shadow-indigo-200">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="font-extrabold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            Humanoid-Sec AI
          </h1>
        </div>

        <nav className="p-4 space-y-2">
          <NavItem
            icon={<LayoutDashboard className="w-5 h-5" />}
            label="Dashboard"
            active={activeTab === 'dashboard'}
            onClick={() => { setActiveTab('dashboard'); setSelectedTarget(null); }}
          />
          <NavItem
            icon={<ClipboardCheck className="w-5 h-5" />}
            label="Checklists"
            active={activeTab === 'checklists'}
            onClick={() => { setActiveTab('checklists'); setSelectedTarget(null); }}
          />
          <NavItem
            icon={<TargetIcon className="w-5 h-5" />}
            label="Targets"
            active={activeTab === 'targets'}
            onClick={() => { setActiveTab('targets'); setSelectedTarget(null); }}
          />
          <NavItem
            icon={<BookOpen className="w-5 h-5" />}
            label="Guides"
            active={activeTab === 'guides'}
            onClick={() => { setActiveTab('guides'); setSelectedTarget(null); }}
          />
          <NavItem
            icon={<Settings className="w-5 h-5" />}
            label="Settings"
            active={activeTab === 'settings'}
            onClick={() => { setActiveTab('settings'); setSelectedTarget(null); }}
          />
        </nav>
      </aside>

      {/* Main Content */}
      <main className="pl-64">
        <header className="h-20 bg-white/40 backdrop-blur-md border-b border-white/20 flex items-center justify-between px-8 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-slate-800 capitalize">{activeTab}</h2>
            {selectedTarget && (
              <>
                <ChevronRight className="w-4 h-4 text-slate-400" />
                <span className="text-primary font-semibold bg-primary-light px-3 py-1 rounded-full text-sm">{selectedTarget.name}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search targets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white/50 border border-white/60 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all w-64"
              />
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Target
            </button>
          </div>
        </header>

        <div className="p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab + (selectedTarget?.id || '')}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && (
                <DashboardView
                  targets={targets}
                  onSelectTarget={(t) => { setSelectedTarget(t); setActiveTab('targets'); }}
                  onViewAll={() => setActiveTab('targets')}
                />
              )}
              {activeTab === 'checklists' && (
                selectedChecklist
                  ? <ChecklistView
                    checklist={selectedChecklist}
                    onBack={() => setSelectedChecklist(null)}
                    isAdmin={isAdmin}
                    currentTheme={currentTheme}
                    onEdit={(cl) => {
                      setNewChecklist(cl);
                      setShowAddChecklistModal(true);
                    }}
                  />
                  : <ChecklistsListView
                    checklists={checklists}
                    onSelect={setSelectedChecklist}
                    isAdmin={isAdmin}
                    currentTheme={currentTheme}
                    onEdit={(cl) => {
                      setNewChecklist(cl);
                      setShowAddChecklistModal(true);
                    }}
                    onCreate={() => {
                      setNewChecklist({
                        id: `cl-${Date.now()}`,
                        title: '',
                        description: '',
                        items: [
                          { id: 'i1', text: '', category: 'Software', weight: 3 }
                        ]
                      });
                      setShowAddChecklistModal(true);
                    }}
                  />
              )}
              {activeTab === 'targets' && (
                selectedTarget && activeChecklist
                  ? <TargetDetailView
                    target={selectedTarget}
                    checklist={activeChecklist}
                    allChecklists={checklists}
                    isAdmin={isAdmin}
                    currentTheme={currentTheme}
                    onChecklistChange={setTargetChecklistId}
                    onBack={() => { setSelectedTarget(null); setTargetChecklistId(null); }}
                    onDelete={handleDeleteTarget}
                    onUpdate={handleUpdateTarget}
                  />
                  : <TargetsListView targets={filteredTargets} onSelect={setSelectedTarget} />
              )}
              {activeTab === 'guides' && (
                <GuidesView
                  guides={guides}
                  onImport={handleImportGuide}
                  onDelete={handleDeleteGuide}
                  isAdmin={isAdmin}
                />
              )}
              {activeTab === 'settings' && (
                <SettingsView
                  isAdmin={isAdmin}
                  setIsAdmin={setIsAdmin}
                  currentTheme={currentTheme}
                  onThemeChange={setCurrentTheme}
                  onSeed={() => setShowSeedModal(true)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {showSeedModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="p-8 text-center">
                  <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-amber-100">
                    <AlertTriangle className="w-10 h-10 text-amber-600" />
                  </div>
                  <h3 className="text-2xl font-extrabold text-slate-900 mb-3">Initialize Database?</h3>
                  <p className="text-slate-500 font-medium leading-relaxed">
                    This will delete all your current targets and checklists and replace them with the standard security baseline. This action cannot be undone.
                  </p>
                </div>
                <div className="p-8 bg-slate-50 flex gap-4">
                  <button
                    disabled={isSeeding}
                    onClick={() => !isSeeding && setShowSeedModal(false)}
                    className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={isSeeding}
                    onClick={async () => {
                      if (isSeeding) return;
                      setIsSeeding(true);
                      console.log("Starting database seeding...");
                      try {
                        const res = await fetch('/api/seed', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' }
                        });
                        if (res.ok) {
                          console.log("Seeding successful, updating UI...");
                          // Reset states in a specific order
                          setIsSeeding(false);
                          setShowSeedModal(false);
                          setActiveTab('dashboard');
                          fetchData();
                        } else {
                          const errorData = await res.json();
                          console.error("Seeding failed:", errorData);
                          alert("Failed to seed database: " + (errorData.error || "Unknown error"));
                          setIsSeeding(false);
                          setShowSeedModal(false);
                        }
                      } catch (e) {
                        console.error("Seeding error:", e);
                        alert("An error occurred while seeding the database.");
                        setIsSeeding(false);
                        setShowSeedModal(false);
                      }
                    }}
                    className={`flex-1 px-6 py-3 text-white rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${isSeeding ? 'bg-slate-400 cursor-not-allowed' : 'bg-primary hover:bg-primary-dark shadow-primary/20 cursor-pointer'
                      }`}
                  >
                    {isSeeding ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Seeding...
                      </>
                    ) : (
                      'Yes, Reset Data'
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Add Target Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-xl font-bold text-slate-900">Add New Security Target</h3>
                <p className="text-sm text-slate-500 mt-1">Define a new robot or system to analyze.</p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Target Name</label>
                  <input
                    type="text"
                    value={newTarget.name}
                    onChange={(e) => setNewTarget({ ...newTarget, name: e.target.value })}
                    placeholder="e.g. Warehouse AGV #1"
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Robot Type</label>
                  <select
                    value={newTarget.type}
                    onChange={(e) => setNewTarget({ ...newTarget, type: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Select Type</option>
                    <option value="Mobile Robot">Mobile Robot</option>
                    <option value="Industrial Arm">Industrial Arm</option>
                    <option value="UAV">UAV</option>
                    <option value="Humanoid">Humanoid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Description</label>
                  <textarea
                    value={newTarget.description}
                    onChange={(e) => setNewTarget({ ...newTarget, description: e.target.value })}
                    placeholder="Describe the robot's role and environment..."
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 h-24 resize-none"
                  />
                </div>
              </div>
              <div className="p-6 bg-slate-50 flex gap-3">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddTarget}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg font-bold hover:bg-primary-dark transition-all"
                >
                  Create Target
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Checklist Modal */}
      <AnimatePresence>
        {showAddChecklistModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddChecklistModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Create Security Checklist</h3>
                  <p className="text-sm text-slate-500 mt-1">Design a new set of security controls for robots.</p>
                </div>
                <button onClick={() => setShowAddChecklistModal(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Checklist Title</label>
                    <input
                      type="text"
                      value={newChecklist.title}
                      onChange={(e) => setNewChecklist({ ...newChecklist, title: e.target.value })}
                      placeholder="e.g. Humanoid Safety Protocol"
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Description</label>
                    <textarea
                      value={newChecklist.description}
                      onChange={(e) => setNewChecklist({ ...newChecklist, description: e.target.value })}
                      placeholder="What does this checklist cover?"
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 h-20 resize-none"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-primary uppercase tracking-widest">Checklist Items</h4>
                    <button
                      onClick={() => {
                        setNewChecklist({
                          ...newChecklist,
                          items: [...newChecklist.items, { id: `i${Date.now()}`, text: '', category: 'Software', weight: 3 }]
                        });
                        setTimeout(() => itemsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                      }}
                      className="text-primary text-xs font-bold flex items-center gap-1 hover:underline"
                    >
                      <Plus className="w-3 h-3" /> Add Item
                    </button>
                  </div>

                  {newChecklist.items.map((item, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 bg-primary text-white text-[10px] font-bold rounded-lg flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={item.text}
                          onChange={(e) => {
                            const newItems = [...newChecklist.items];
                            newItems[idx].text = e.target.value;
                            setNewChecklist({ ...newChecklist, items: newItems });
                          }}
                          placeholder="Security control text..."
                          className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-700 p-0"
                        />
                        <button
                          onClick={() => {
                            const newItems = newChecklist.items.filter((_, i) => i !== idx);
                            setNewChecklist({ ...newChecklist, items: newItems });
                          }}
                          className="text-rose-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Detailed Requirements</label>
                        <textarea
                          value={item.description || ''}
                          onChange={(e) => {
                            const newItems = [...newChecklist.items];
                            newItems[idx].description = e.target.value;
                            setNewChecklist({ ...newChecklist, items: newItems });
                          }}
                          placeholder="Technical details..."
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 h-16 resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">Implementation Guide <span className="text-[9px] font-normal text-slate-300">(Optional code/steps)</span></label>
                        <textarea
                          value={item.implementationGuide || ''}
                          onChange={(e) => {
                            const newItems = [...newChecklist.items];
                            newItems[idx].implementationGuide = e.target.value;
                            setNewChecklist({ ...newChecklist, items: newItems });
                          }}
                          placeholder="e.g. Run `sudo ufw enable` or code snippet..."
                          className="w-full px-3 py-2 text-xs bg-slate-900 text-emerald-400 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 h-16 resize-none font-mono"
                        />
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Category</label>
                          <select
                            value={item.category}
                            onChange={(e) => {
                              const newItems = [...newChecklist.items];
                              newItems[idx].category = e.target.value as any;
                              setNewChecklist({ ...newChecklist, items: newItems });
                            }}
                            className="w-full text-xs bg-white border border-slate-200 rounded-md py-1 px-2"
                          >
                            <option value="Network">Network</option>
                            <option value="Physical">Physical</option>
                            <option value="Software">Software</option>
                            <option value="Access">Access</option>
                            <option value="System">System</option>
                            <option value="OS">OS</option>
                            <option value="Cloud">Cloud</option>
                            <option value="Audit">Audit</option>
                          </select>
                        </div>
                        <div className="w-24">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Weight (1-5)</label>
                          <input
                            type="number"
                            min="1"
                            max="5"
                            value={item.weight}
                            onChange={(e) => {
                              const newItems = [...newChecklist.items];
                              newItems[idx].weight = parseInt(e.target.value);
                              setNewChecklist({ ...newChecklist, items: newItems });
                            }}
                            className="w-full text-xs bg-white border border-slate-200 rounded-md py-1 px-2"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={itemsEndRef} />
                </div>
              </div>
              <div className="p-6 bg-slate-50 flex gap-3">
                <button
                  onClick={() => setShowAddChecklistModal(false)}
                  className="flex-1 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      const isEdit = checklists.some(c => c.id === newChecklist.id);
                      const res = await fetch(isEdit ? `/api/checklists/${newChecklist.id}` : '/api/checklists', {
                        method: isEdit ? 'PUT' : 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newChecklist)
                      });
                      if (res.ok) {
                        if (isEdit) {
                          setChecklists(checklists.map(c => c.id === newChecklist.id ? newChecklist : c));
                          if (selectedChecklist?.id === newChecklist.id) {
                            setSelectedChecklist(newChecklist);
                          }
                        } else {
                          setChecklists([...checklists, newChecklist]);
                        }
                        setShowAddChecklistModal(false);
                      }
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg font-bold hover:bg-primary-dark transition-all"
                >
                  {checklists.some(c => c.id === newChecklist.id) ? 'Update Checklist' : 'Save Checklist'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${active
        ? 'bg-primary-light text-primary font-semibold shadow-sm'
        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
        }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function DashboardView({ targets, onSelectTarget, onViewAll }: { targets: Target[], onSelectTarget: (t: Target) => void, onViewAll: () => void }) {
  const [history, setHistory] = useState<any[]>([]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const avgRisk = useMemo(() => {
    if (!targets || targets.length === 0) return 0;
    const sum = targets.reduce((acc, t) => acc + (t.riskScore || 0), 0);
    return Math.round(sum / targets.length);
  }, [targets]);

  const highRiskCount = useMemo(() => {
    if (!targets) return 0;
    return targets.filter(t => (t.riskScore || 0) > 70).length;
  }, [targets]);

  const trends = useMemo(() => {
    if (!history || history.length === 0) {
      return { health: "No prior data", targets: "No prior data", alerts: "No prior data" };
    }
    if (history.length === 1) {
      return { health: "Baseline established", targets: "Baseline established", alerts: "Baseline established" };
    }

    // history is DESC, so history[0] is latest, history[history.length-1] is oldest
    const baseline = history.length >= 7 ? history[6] : history[history.length - 1];
    if (!baseline) return { health: "Data unavailable", targets: "Data unavailable", alerts: "Data unavailable" };

    const currentHealth = 100 - avgRisk;
    const baselineHealth = 100 - (baseline.avg_risk || 0);

    const healthDiff = currentHealth - baselineHealth;
    const targetsDiff = (targets?.length || 0) - (baseline.active_targets || 0);
    const alertsDiff = highRiskCount - (baseline.critical_alerts || 0);

    return {
      health: healthDiff === 0 ? "Stable" : `${healthDiff > 0 ? '+' : ''}${healthDiff}% from baseline`,
      targets: targetsDiff === 0 ? "No change" : `${targetsDiff > 0 ? '+' : ''}${targetsDiff} change`,
      alerts: alertsDiff === 0 ? "No new alerts" : `${alertsDiff > 0 ? '+' : ''}${alertsDiff} vs baseline`
    };
  }, [history, avgRisk, targets, highRiskCount]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Fleet Security Health"
          value={`${100 - avgRisk}%`}
          icon={<ShieldCheck className="text-primary" />}
          trend={trends.health}
          description="Overall security posture based on the average risk score of all active targets. Higher is better."
        />
        <StatCard
          label="Active Targets"
          value={targets.length.toString()}
          icon={<TargetIcon className="text-emerald-600" />}
          trend={trends.targets}
          description="Total number of humanoid units or systems currently being monitored by the security fleet."
        />
        <StatCard
          label="Critical Alerts"
          value={highRiskCount.toString()}
          icon={<AlertTriangle className="text-rose-600" />}
          trend={trends.alerts}
          description="Number of targets with a risk score above 70, requiring immediate security intervention."
        />
        <StatCard
          label="Security Rank"
          value={targets.length === 0 ? 'Unranked' : avgRisk < 30 ? 'Sentinel' : avgRisk < 60 ? 'Guardian' : 'Initiate'}
          icon={<Trophy className={
            targets.length === 0 ? "text-slate-300" :
              avgRisk < 30 ? "text-amber-400" : // Sentinel: Gold
                avgRisk < 60 ? "text-slate-400" : // Guardian: Silver
                  "text-amber-700"                  // Initiate: Bronze
          } />}
          trend={targets.length === 0 ? "No active targets" : avgRisk < 30 ? "Elite Status" : "Next: Sentinel"}
          description="Your fleet's overall security designation based on current risk levels and compliance."
        />
      </div>

      <div className="glass-card rounded-3xl overflow-hidden">
        <div className="p-8 border-b border-white/20 flex items-center justify-between bg-white/30">
          <div>
            <h3 className="font-extrabold text-xl text-slate-800">Security Fleet Overview</h3>
            <p className="text-slate-500 text-sm mt-1">Real-time risk assessment of your autonomous fleet.</p>
          </div>
          <button
            onClick={onViewAll}
            className="text-primary text-sm font-bold hover:text-primary-dark bg-primary-light px-4 py-2 rounded-xl transition-all"
          >
            View All Systems
          </button>
        </div>
        <div className="divide-y divide-white/20">
          {targets.length > 0 ? (
            targets.slice(0, 5).map(target => (
              <TargetRow
                key={target.id}
                name={target.name}
                type={target.type}
                risk={target.riskScore}
                status={target.riskScore > 70 ? 'High' : target.riskScore > 40 ? 'Medium' : 'Low'}
                onClick={() => onSelectTarget(target)}
              />
            ))
          ) : (
            <div className="p-12 text-center text-slate-400 font-medium">No targets found. Add one to start monitoring.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChecklistView({ checklist, onBack, isAdmin, onEdit, currentTheme }: { checklist: Checklist, onBack: () => void, isAdmin: boolean, onEdit: (cl: Checklist) => void, currentTheme: Theme }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-slate-500 hover:text-primary flex items-center gap-2 text-sm font-bold transition-all bg-white/50 px-4 py-2 rounded-xl border border-white/60">
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back to Checklists
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const md = exportChecklistToMarkdown(checklist);
                downloadMarkdown(checklist.title, md);
              }}
              className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all flex items-center gap-2"
              title="Export as Markdown"
            >
              MD
            </button>
            <button
              onClick={() => generateChecklistPDF(checklist, currentTheme)}
              className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all flex items-center gap-2"
              title="Export as PDF"
            >
              PDF
            </button>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => onEdit(checklist)}
            className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-primary-dark transition-all shadow-lg shadow-indigo-100"
          >
            <Settings className="w-4 h-4" />
            Edit Checklist
          </button>
        )}
      </div>
      <div className="glass-card p-10 rounded-3xl">
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-indigo-100">
            <ClipboardCheck className="w-8 h-8 text-white" />
          </div>
          <div>
            <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">{checklist.title}</h3>
            <p className="text-slate-500 font-medium mt-1">{checklist.description}</p>
          </div>
        </div>

        <div className="mt-10 space-y-4">
          {checklist.items.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
              className="flex flex-col gap-2 p-6 bg-white/40 rounded-2xl border border-white/60 hover:bg-white/60 transition-all group cursor-pointer"
            >
              <div className="flex items-start gap-5">
                <span className="bg-primary w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-md group-hover:scale-110 transition-transform">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <p className="font-bold text-slate-800 text-lg">{item.text}</p>
                  <div className="flex items-center gap-4 mt-3">
                    <span className="text-[10px] uppercase font-extrabold tracking-widest px-3 py-1 bg-primary-light text-primary rounded-lg">
                      {item.category}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">
                        Impact Weight: {item.weight}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0 text-slate-300 group-hover:text-indigo-400 transition-colors">
                  {expandedId === item.id ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
                </div>
              </div>
              {expandedId === item.id && (item.description || item.implementationGuide) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="mt-4 space-y-3"
                >
                  {item.description && (
                    <div className="p-4 bg-primary-light/50 rounded-xl border border-primary-light text-sm text-slate-600 leading-relaxed font-medium">
                      <p className="text-xs font-extrabold text-primary uppercase tracking-wider mb-2 flex items-center gap-2"><ShieldCheck className="w-3 h-3" /> Requirement</p>
                      {item.description}
                    </div>
                  )}
                  {item.implementationGuide && (
                    <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 text-sm text-slate-300 leading-relaxed">
                      <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2"><Activity className="w-3 h-3" /> Implementation Guide</p>
                      <div className="whitespace-pre-wrap font-mono text-xs text-emerald-400">{item.implementationGuide}</div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChecklistsListView({ checklists, onSelect, onCreate, onEdit, isAdmin, currentTheme }: { checklists: Checklist[], onSelect: (cl: Checklist) => void, onCreate: () => void, onEdit: (cl: Checklist) => void, isAdmin: boolean, currentTheme: Theme }) {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">Security Checklists</h3>
          <p className="text-slate-500 font-medium mt-1">Standardized security controls for different robot classes.</p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => {
                const md = exportAllChecklistsToMarkdown(checklists);
                downloadMarkdown('Full_Security_Checklists', md);
              }}
              className="text-xs font-bold text-slate-400 hover:text-primary flex items-center gap-1 transition-colors"
            >
              <Download className="w-3 h-3" />
              Export All (MD)
            </button>
            <span className="text-slate-200">|</span>
            <button
              onClick={() => generateAllChecklistsPDF(checklists, currentTheme)}
              className="text-xs font-bold text-slate-400 hover:text-primary flex items-center gap-1 transition-colors"
            >
              <Download className="w-3 h-3" />
              Export All (PDF)
            </button>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={onCreate}
            className="btn-primary px-6 py-3 rounded-2xl text-sm font-extrabold flex items-center gap-3"
          >
            <Plus className="w-5 h-5" />
            New Checklist
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {checklists.map(cl => (
          <div
            key={cl.id}
            className="glass-card p-8 rounded-3xl hover:shadow-primary-light hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
          >
            <div onClick={() => onSelect(cl)}>
              <div className="flex items-center gap-4 mb-6">
                <div className="bg-primary-light p-4 rounded-2xl group-hover:bg-primary transition-all duration-300">
                  <ClipboardCheck className="w-6 h-6 text-primary group-hover:text-white" />
                </div>
                <div>
                  <h4 className="text-xl font-extrabold text-slate-900 tracking-tight">{cl.title}</h4>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">{cl.items.length} Security Controls</p>
                </div>
              </div>
              <p className="text-slate-500 text-sm font-medium leading-relaxed">{cl.description}</p>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <div className="flex -space-x-2">
                {Array.from(new Set(cl.items.map(i => i.category))).map(cat => (
                  <div key={cat} className="w-8 h-8 rounded-full bg-white border-2 border-slate-50 flex items-center justify-center shadow-sm" title={cat}>
                    <Shield className="w-3 h-3 text-indigo-400" />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit(cl); }}
                    className="p-2 bg-slate-50 rounded-lg text-slate-400 hover:text-primary hover:bg-primary-light transition-all"
                  >
                    <Settings className="w-5 h-5" />
                  </button>
                )}
                <div onClick={() => onSelect(cl)} className="bg-slate-50 p-2 rounded-lg group-hover:bg-primary-light transition-colors">
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TargetsListView({ targets, onSelect }: { targets: Target[], onSelect: (t: Target) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {targets.map(target => (
        <div
          key={target.id}
          onClick={() => onSelect(target)}
          className="glass-card p-8 rounded-3xl hover:shadow-primary-light hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -mr-8 -mt-8 group-hover:bg-primary/10 transition-colors" />

          <div className="flex items-center justify-between mb-6">
            <div className="p-4 bg-primary-light rounded-2xl group-hover:bg-primary transition-all duration-300">
              <TargetIcon className="w-6 h-6 text-primary group-hover:text-white" />
            </div>
            <div className={`status-badge ${target.riskScore > 70 ? 'bg-rose-50 text-rose-600 border-rose-100' :
              target.riskScore > 40 ? 'bg-amber-50 text-amber-600 border-amber-100' :
                'bg-emerald-50 text-emerald-600 border-emerald-100'
              }`}>
              {target.riskScore > 70 ? 'Critical' : target.riskScore > 40 ? 'Warning' : 'Secure'}
            </div>
          </div>
          <h4 className="text-xl font-extrabold text-slate-900 tracking-tight">{target.name}</h4>
          <p className="text-sm text-slate-500 font-medium mt-1">{target.type}</p>

          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-extrabold tracking-widest">Risk Exposure</p>
              <div className="flex items-baseline gap-1 mt-1">
                <p className="text-2xl font-mono font-bold text-slate-800">{target.riskScore}</p>
                <span className="text-xs text-slate-400 font-bold">%</span>
              </div>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg group-hover:bg-primary-light transition-colors">
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TargetDetailView({
  target,
  checklist,
  allChecklists,
  isAdmin,
  onChecklistChange,
  onBack,
  onDelete,
  onUpdate,
  currentTheme
}: {
  target: Target,
  checklist: Checklist,
  allChecklists: Checklist[],
  isAdmin: boolean,
  onChecklistChange: (id: string) => void,
  onBack: () => void,
  onDelete: (id: string) => void,
  onUpdate: (t: Target) => void,
  currentTheme: Theme
}) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<RiskAnalysis | null>(null);
  const [selectedModel, setSelectedModel] = useState<AIModel>('gemini-3-flash-preview');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const riskScore = useMemo(() => {
    return calculateGlobalRiskScore(target.checklistResults, allChecklists);
  }, [target, allChecklists]);

  const toggleItem = (itemId: string) => {
    const currentResults = target.checklistResults[checklist.id] || {};
    const itemResult = currentResults[itemId] || { checked: false, justification: '', reviewStatus: 'pending' };

    const newResults = {
      ...target.checklistResults,
      [checklist.id]: {
        ...currentResults,
        [itemId]: {
          ...itemResult,
          checked: !itemResult.checked
        }
      }
    };

    const newRiskScore = calculateGlobalRiskScore(newResults, allChecklists);
    onUpdate({ ...target, checklistResults: newResults, riskScore: newRiskScore });
  };

  const updateJustification = (itemId: string, justification: string) => {
    const currentResults = target.checklistResults[checklist.id] || {};
    const itemResult = currentResults[itemId] || { checked: false, justification: '', reviewStatus: 'pending' };

    const newResults = {
      ...target.checklistResults,
      [checklist.id]: {
        ...currentResults,
        [itemId]: {
          ...itemResult,
          justification
        }
      }
    };

    onUpdate({ ...target, checklistResults: newResults });
  };

  const updateReviewStatus = (itemId: string, status: 'pending' | 'approved' | 'rejected') => {
    const currentResults = target.checklistResults[checklist.id] || {};
    const itemResult = currentResults[itemId] || { checked: false, justification: '', reviewStatus: 'pending' };

    const newResults = {
      ...target.checklistResults,
      [checklist.id]: {
        ...currentResults,
        [itemId]: {
          ...itemResult,
          reviewStatus: status
        }
      }
    };

    const newRiskScore = calculateGlobalRiskScore(newResults, allChecklists);
    onUpdate({ ...target, checklistResults: newResults, riskScore: newRiskScore });
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const result = await analyzeRobotRisk({ ...target, riskScore }, checklist, selectedModel);
      setAnalysis(result);
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-slate-500 hover:text-primary flex items-center gap-2 text-sm font-bold transition-all bg-white/50 px-4 py-2 rounded-xl border border-white/60">
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back to Fleet
          </button>
          <button
            onClick={() => generateTargetSecurityReport(target, checklist, currentTheme, analysis)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
          >
            <ClipboardCheck className="w-4 h-4" />
            Generate Security Report
          </button>
        </div>
        <button
          onClick={() => { if (confirm('Are you sure you want to decommission this target?')) onDelete(target.id); }}
          className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-bold transition-all"
        >
          <Trash2 className="w-4 h-4" />
          Decommission Target
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          {/* Checklist Selector */}
          <div className="relative group">
            <div className="flex items-center gap-2 overflow-x-auto pb-4 custom-scrollbar-h">
              {allChecklists.map(cl => (
                <button
                  key={cl.id}
                  onClick={() => onChecklistChange(cl.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border-2 ${checklist.id === cl.id
                    ? 'bg-primary text-white border-primary shadow-lg shadow-indigo-100'
                    : 'bg-white text-slate-500 border-slate-100 hover:border-primary-light'
                    }`}
                >
                  {cl.title}
                </button>
              ))}
            </div>
            {/* Gradient Fades */}
            <div className="absolute top-0 right-0 bottom-4 w-12 bg-gradient-to-l from-[#F0F2F5] to-transparent pointer-events-none opacity-60 transition-opacity" />
            <div className="absolute top-0 left-0 bottom-4 w-12 bg-gradient-to-r from-[#F0F2F5] to-transparent pointer-events-none opacity-60 transition-opacity" />
          </div>

          <div className="glass-card p-10 rounded-3xl">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">{checklist.title}</h3>
                <p className="text-slate-500 font-medium mt-1">{checklist.description}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">AI Engine</span>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value as AIModel)}
                    className="bg-white/50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-primary outline-none transition-all"
                  >
                    <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                    <option value="gpt-4o">GPT-4o (OpenAI)</option>
                    <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                  </select>
                </div>
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="btn-primary px-8 py-3 rounded-2xl text-sm font-extrabold flex items-center gap-3 disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <Activity className="w-5 h-5 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Run AI Audit
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="grid gap-4">
              {checklist.items.map(item => {
                const result = target.checklistResults[checklist.id]?.[item.id] || { checked: false, justification: '', reviewStatus: 'pending' };
                const completed = result.checked;
                const isApproved = result.reviewStatus === 'approved';
                const isRejected = result.reviewStatus === 'rejected';

                return (
                  <div
                    key={item.id}
                    className={`flex flex-col gap-4 p-6 rounded-2xl border-2 transition-all ${completed
                      ? 'border-emerald-200 bg-emerald-50/50 shadow-inner'
                      : isApproved
                        ? 'border-primary-light bg-primary-light/50 shadow-inner'
                        : 'border-slate-100 bg-white/40 hover:border-primary-light hover:bg-white/60'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-5 cursor-pointer" onClick={() => toggleItem(item.id)}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${completed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200'
                          }`}>
                          {completed && <CheckCircle2 className="w-4 h-4 text-white" />}
                        </div>
                        <span className={`text-lg font-bold ${completed ? 'text-emerald-700' : isApproved ? 'text-primary' : 'text-slate-600'}`}>
                          {item.text}
                          {isApproved && <span className="ml-3 text-[10px] bg-primary text-white px-2 py-0.5 rounded-full uppercase tracking-widest">Exception Approved</span>}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] uppercase font-extrabold tracking-widest px-3 py-1 bg-white/80 rounded-lg text-slate-500 border border-slate-100">
                          {item.category}
                        </span>
                      </div>
                    </div>

                    {!completed && (
                      <div className="ml-11 space-y-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className={`w-4 h-4 ${isApproved ? 'text-primary-light' : 'text-amber-500'}`} />
                          <p className="text-xs font-bold text-slate-500">Justification for Exception</p>
                        </div>
                        <textarea
                          value={result.justification}
                          onChange={(e) => updateJustification(item.id, e.target.value)}
                          placeholder="Why is this control not applicable or currently unachievable?"
                          className="w-full p-3 bg-white/80 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none transition-all resize-none h-20"
                        />

                        {isAdmin && result.justification && (
                          <div className="flex items-center gap-3 pt-2">
                            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Expert Review:</p>
                            <button
                              onClick={() => updateReviewStatus(item.id, 'approved')}
                              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${isApproved ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'
                                }`}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => updateReviewStatus(item.id, 'rejected')}
                              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${isRejected ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600'
                                }`}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {(item.description || item.implementationGuide) && (
                      <div
                        onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                        className="mt-1 ml-11 text-xs font-semibold text-primary hover:text-primary-dark flex items-center gap-1 cursor-pointer w-fit"
                      >
                        {expandedId === item.id ? 'Hide Details' : 'View Details & Guides'}
                      </div>
                    )}
                    {expandedId === item.id && (item.description || item.implementationGuide) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="mt-3 ml-11 space-y-3"
                      >
                        {item.description && (
                          <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 text-sm text-slate-600 leading-relaxed">
                            <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">Requirement</p>
                            {item.description}
                          </div>
                        )}
                        {item.implementationGuide && (
                          <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 text-sm text-slate-300 leading-relaxed">
                            <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2"><Activity className="w-3 h-3" /> Implementation Guide</p>
                            <div className="whitespace-pre-wrap font-mono text-xs text-emerald-400">{item.implementationGuide}</div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {analysis && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-10 rounded-3xl space-y-8 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Shield className="w-32 h-32 text-primary" />
              </div>

              <div className="flex items-center justify-between relative z-10">
                <h4 className="text-2xl font-extrabold text-slate-900 flex items-center gap-3">
                  <div className="bg-primary-light p-2 rounded-xl">
                    <Shield className="w-6 h-6 text-primary" />
                  </div>
                  AI Security Intelligence
                </h4>
                <span className={`status-badge ${analysis.severity === 'Critical' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                  analysis.severity === 'High' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                    analysis.severity === 'Medium' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                      'bg-emerald-100 text-emerald-700 border-emerald-200'
                  }`}>
                  {analysis.severity} Risk Level
                </span>
              </div>

              <div className="p-6 bg-primary-light/50 rounded-2xl border border-primary-light/50 relative z-10">
                <p className="text-slate-700 leading-relaxed font-medium">{analysis.summary}</p>
              </div>

              <div className="space-y-4 relative z-10">
                <h5 className="text-xs font-extrabold text-primary uppercase tracking-[0.2em]">Strategic Recommendations</h5>
                <div className="grid gap-3">
                  {analysis.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-4 p-4 bg-white/40 rounded-xl border border-white/60">
                      <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {i + 1}
                      </div>
                      <p className="text-slate-600 text-sm font-bold leading-relaxed">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="glass-card p-8 rounded-3xl text-center sticky top-28">
            <p className="text-xs font-extrabold text-slate-400 uppercase tracking-[0.2em]">Security Shield Status</p>

            <div className="mt-8 relative inline-block">
              {/* Shield Visualization */}
              <div className="relative z-10">
                <svg className="w-48 h-48 -rotate-90">
                  <circle className="text-slate-100" strokeWidth="12" stroke="currentColor" fill="transparent" r="80" cx="96" cy="96" />
                  <circle
                    className={riskScore > 70 ? 'text-rose-500' : riskScore > 40 ? 'text-amber-500' : 'text-emerald-500'}
                    strokeWidth="12"
                    strokeDasharray={502}
                    strokeDashoffset={502 - (502 * (100 - riskScore)) / 100}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r="80" cx="96" cy="96"
                    style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <span className="text-5xl font-extrabold text-slate-800 tracking-tighter">{100 - riskScore}</span>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">Shield Power</span>
                </div>
              </div>

              {/* Decorative Glow */}
              <div className={`absolute inset-0 blur-3xl opacity-20 -z-10 rounded-full ${riskScore > 70 ? 'bg-rose-500' : riskScore > 40 ? 'bg-amber-500' : 'bg-emerald-500'
                }`} />
            </div>

            <div className="mt-8 space-y-2">
              <h4 className={`font-extrabold text-2xl tracking-tight ${riskScore > 70 ? 'text-rose-600' : riskScore > 40 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {riskScore > 70 ? 'System Vulnerable' : riskScore > 40 ? 'Shields Weak' : 'System Fortified'}
              </h4>
              <p className="text-slate-500 text-sm font-medium">
                {riskScore > 70 ? 'Immediate action required to prevent breach.' :
                  riskScore > 40 ? 'Moderate risk detected. Review recommendations.' :
                    'All critical security baselines are met.'}
              </p>
            </div>

            <div className="mt-10 pt-10 border-t border-white/20 text-left space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-extrabold tracking-widest">System Architecture</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{target.type}</p>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl">
                  <Activity className="w-5 h-5 text-slate-400" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-extrabold tracking-widest">Last Audit Date</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{target.lastAnalyzed}</p>
                </div>
                <div className="bg-slate-50 p-2 rounded-xl">
                  <ClipboardCheck className="w-5 h-5 text-slate-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, trend, description }: { label: string, value: string, icon: React.ReactNode, trend?: string, description?: string }) {
  return (
    <div className="glass-card p-6 rounded-3xl relative group hover:z-50">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 bg-white/50 rounded-2xl shadow-sm">{icon}</div>
        {description && (
          <div className="relative group/info">
            <HelpCircle className="w-4 h-4 text-slate-300 hover:text-primary transition-colors cursor-help" />
            <div className="absolute bottom-full right-0 mb-2 w-48 p-3 bg-slate-800 text-white text-[10px] rounded-xl opacity-0 group-hover/info:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl border border-white/10">
              {description}
            </div>
          </div>
        )}
      </div>

      <p className="text-slate-400 text-xs font-extrabold uppercase tracking-widest">{label}</p>
      <h4 className="text-3xl font-extrabold mt-2 text-slate-800 tracking-tight">{value}</h4>
      {trend && (
        <div className="mt-4 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">{trend}</p>
        </div>
      )}
    </div>
  );
}

function SimpleMarkdown({ content }: { content: string }) {
  if (!content) return null;
  const blocks = content.split(/(```[\w]*\n[\s\S]*?\n```)/g);

  return (
    <div className="prose prose-slate max-w-none space-y-4">
      {blocks.map((block, i) => {
        if (block.startsWith('```')) {
          const match = block.match(/```([\w]*)\n([\s\S]*?)\n```/);
          if (!match) return null;
          const lang = match[1];
          const code = match[2];
          return (
            <div key={i} className="relative group mt-6 mb-8">
              <div className="absolute top-0 left-0 w-full h-10 bg-slate-800 rounded-t-xl flex items-center px-4 border-b border-slate-700">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                </div>
                {lang && <span className="ml-4 text-xs font-mono text-slate-400">{lang}</span>}
              </div>
              <pre className="bg-slate-900 text-slate-300 p-6 pt-14 rounded-xl overflow-x-auto text-sm font-mono leading-relaxed shadow-2xl border border-slate-800 custom-scrollbar-h">
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        const paragraphs = block.split('\n\n');
        return paragraphs.map((p, j) => {
          if (!p.trim()) return null;

          const hMatch = p.match(/^(#{1,6})\s+(.*)/);
          if (hMatch) {
            const level = hMatch[1].length;
            const text = hMatch[2];
            if (level === 3) {
              return (
                <h4 key={`${i}-${j}`} className="text-2xl font-extrabold text-slate-900 flex items-center gap-3 mb-6 border-b border-slate-100 pb-4 mt-8">
                  <div className="bg-primary-light p-2 rounded-xl shadow-sm">
                    <ShieldCheck className="w-6 h-6 text-primary" />
                  </div>
                  {text}
                </h4>
              );
            }
            const Tag = `h${level}` as keyof JSX.IntrinsicElements;
            return <Tag key={`${i}-${j}`} className="font-bold text-slate-800 mt-6 mb-2 text-lg">{text}</Tag>;
          }

          const parts = p.split(/(`[^`]+`)/g);
          return (
            <p key={`${i}-${j}`} className="text-slate-600 font-medium leading-relaxed mb-4 whitespace-pre-wrap">
              {parts.map((part, k) => {
                if (part.startsWith('`') && part.endsWith('`')) {
                  return <code key={k} className="bg-slate-100 text-pink-600 px-1.5 py-0.5 rounded-md font-mono text-sm border border-slate-200">{part.slice(1, -1)}</code>;
                }

                const boldParts = part.split(/(\*\*.*?\*\*)/g);
                return (
                  <React.Fragment key={k}>
                    {boldParts.map((bp, l) => {
                      if (bp.startsWith('**') && bp.endsWith('**')) {
                        return <strong key={l} className="text-slate-900 font-extrabold">{bp.slice(2, -2)}</strong>;
                      }
                      return <React.Fragment key={l}>{bp}</React.Fragment>;
                    })}
                  </React.Fragment>
                );
              })}
            </p>
          );
        });
      })}
    </div>
  );
}

function GuidesView({ guides, onImport, onDelete, isAdmin }: { guides: Guide[], onImport: (g: Guide) => void, onDelete: (id: string) => void, isAdmin: boolean }) {
  const [selectedGuide, setSelectedGuide] = useState<Guide | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      const titleMatch = content.match(/^#+\s+(.*)$/m);
      const title = titleMatch ? titleMatch[1].replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim() : file.name.replace('.md', '');

      onImport({
        id: `g-${Date.now()}`,
        title: title || 'Imported Guide',
        description: `Imported from ${file.name}`,
        content
      });
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (selectedGuide) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 pb-20">
        <div className="flex items-center justify-between">
          <button onClick={() => setSelectedGuide(null)} className="text-slate-500 hover:text-primary flex items-center gap-2 text-sm font-bold transition-all bg-white/50 px-4 py-2 rounded-xl border border-white/60">
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back to Guides
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadMarkdown(selectedGuide.title.replace(/\s+/g, '_'), selectedGuide.content)}
              className="text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
            >
              <Download className="w-4 h-4" />
              Export MD
            </button>
            {isAdmin && (
              <button
                onClick={() => {
                  if (confirm('Delete this guide?')) {
                    onDelete(selectedGuide.id);
                    setSelectedGuide(null);
                  }
                }}
                className="text-rose-500 hover:bg-rose-50 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
        </div>
        <div className="glass-card p-10 rounded-3xl">
          <SimpleMarkdown content={selectedGuide.content} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">Security Guides</h3>
          <p className="text-slate-500 font-medium mt-1">Comprehensive implementation scripts and tutorials for your fleet.</p>
        </div>
        {isAdmin && (
          <div>
            <input type="file" accept=".md" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary px-6 py-3 rounded-2xl text-sm font-extrabold flex items-center gap-3"
            >
              <UploadCloud className="w-5 h-5" />
              Import Markdown
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {guides.map(guide => (
          <div
            key={guide.id}
            onClick={() => setSelectedGuide(guide)}
            className="glass-card p-6 rounded-3xl hover:shadow-primary-light hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start gap-4 mb-4">
                <div className="bg-primary-light p-3 rounded-xl group-hover:bg-primary transition-colors shrink-0">
                  <FileText className="w-5 h-5 text-primary group-hover:text-white" />
                </div>
                <h4 className="text-lg font-bold text-slate-900 leading-tight">{guide.title}</h4>
              </div>
              <p className="text-sm text-slate-500 font-medium line-clamp-2">{guide.description}</p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Read Guide</span>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary transition-colors" />
            </div>
          </div>
        ))}
        {guides.length === 0 && (
          <div className="col-span-2 p-12 text-center text-slate-400 font-medium glass-card rounded-3xl">
            No guides available. Import a markdown file to get started.
          </div>
        )}
      </div>
    </div>
  );
}

interface TargetRowProps {
  name: string;
  type: string;
  risk: number;
  status: string;
  onClick: () => void;
}

function SettingsView({
  isAdmin,
  setIsAdmin,
  currentTheme,
  onThemeChange,
  onSeed
}: {
  isAdmin: boolean,
  setIsAdmin: (val: boolean) => void,
  currentTheme: Theme,
  onThemeChange: (theme: Theme) => void,
  onSeed: () => void
}) {
  const [aiStatus, setAiStatus] = useState({
    gemini: 'Connected',
    openai: 'Not Configured',
    anthropic: 'Not Configured'
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="glass-card p-10 rounded-3xl">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-indigo-100">
              <Settings className="w-8 h-8 text-white" />
            </div>
            <div>
              <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">System Settings</h3>
              <p className="text-slate-500 font-medium mt-1">Configure your AI engines and fleet parameters.</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isAdmin ? 'bg-primary text-white' : 'bg-white text-slate-400 border border-slate-200 shadow-sm'}`}>
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Researcher Mode</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Enable Editing</p>
              </div>
            </div>
            <button
              onClick={() => setIsAdmin(!isAdmin)}
              className={`w-14 h-7 rounded-full transition-all relative ${isAdmin ? 'bg-primary' : 'bg-slate-200'}`}
            >
              <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all ${isAdmin ? 'left-8' : 'left-1'}`} />
            </button>
          </div>
        </div>

        <div className="space-y-10">
          <section>
            <h4 className="text-xs font-extrabold text-primary uppercase tracking-[0.2em] mb-6">Visual Theme</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => onThemeChange(theme)}
                  className={`flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all ${currentTheme.id === theme.id
                    ? 'border-primary bg-primary-light/50'
                    : 'border-slate-100 bg-white/40 hover:border-primary/30'
                    }`}
                >
                  <div
                    className="w-10 h-10 rounded-xl shadow-inner"
                    style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}
                  />
                  <span className={`text-xs font-bold ${currentTheme.id === theme.id ? 'text-primary' : 'text-slate-500'}`}>
                    {theme.name}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="pt-10 border-t border-slate-100">
            <h4 className="text-xs font-extrabold text-primary uppercase tracking-[0.2em] mb-6">AI Engine Integration</h4>
            <div className="grid gap-4">
              {[
                { name: 'Gemini 3 Flash', id: 'gemini', provider: 'Google', status: aiStatus.gemini, icon: <Sparkles className="text-primary" /> },
                { name: 'GPT-4o', id: 'openai', provider: 'OpenAI', status: aiStatus.openai, icon: <Brain className="text-emerald-600" /> },
                { name: 'Claude 3.5 Sonnet', id: 'anthropic', provider: 'Anthropic', status: aiStatus.anthropic, icon: <Activity className="text-amber-600" /> }
              ].map((engine) => (
                <div key={engine.id} className="flex items-center justify-between p-6 bg-white/40 rounded-2xl border border-white/60 hover:bg-white/60 transition-all">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      {engine.icon}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-lg">{engine.name}</p>
                      <p className="text-xs text-slate-400 font-medium">{engine.provider}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest border ${engine.status === 'Connected'
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                      : 'bg-slate-50 text-slate-400 border-slate-100'
                      }`}>
                      {engine.status}
                    </span>
                    {engine.status !== 'Connected' && (
                      <button className="text-primary text-xs font-extrabold hover:underline">
                        Configure API Key
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-slate-400 font-medium italic">
              * AI Studio 환경 변수에서 API 키를 설정하면 자동으로 활성화됩니다.
            </p>
          </section>

          <section className="pt-10 border-t border-slate-100">
            <h4 className="text-xs font-extrabold text-primary uppercase tracking-[0.2em] mb-6">Database Management</h4>
            <div className="p-8 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col items-center gap-4">
              <div className="flex items-center gap-3 text-amber-600 bg-amber-50 px-4 py-2 rounded-lg border border-amber-100">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-bold">Warning: Seeding will overwrite all current data.</span>
              </div>
              <p className="text-slate-500 text-sm font-medium text-center max-w-md">
                If your local environment is missing the standard security checklists, use the button below to initialize the database with default security standards.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <button
                  onClick={onSeed}
                  className="px-6 py-3 bg-primary text-white rounded-xl font-bold flex items-center gap-2 hover:bg-primary-dark transition-all shadow-lg shadow-primary/20"
                >
                  <Plus className="w-4 h-4" />
                  Seed Default Security Data
                </button>
                <button
                  onClick={() => window.open('/api/backup', '_blank')}
                  className="px-6 py-3 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Download Backup (JSON)
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const TargetRow: React.FC<TargetRowProps> = ({ name, type, risk, status, onClick }) => {
  const statusColor = {
    Low: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    Medium: 'bg-amber-50 text-amber-600 border-amber-100',
    High: 'bg-rose-50 text-rose-600 border-rose-100',
  }[status as 'Low' | 'Medium' | 'High'];

  return (
    <div onClick={onClick} className="p-6 hover:bg-white/50 transition-all flex items-center justify-between cursor-pointer group">
      <div className="flex items-center gap-6">
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:bg-primary transition-all duration-300">
          <TargetIcon className="w-6 h-6 text-slate-400 group-hover:text-white" />
        </div>
        <div>
          <h5 className="font-bold text-slate-900 text-lg tracking-tight">{name}</h5>
          <p className="text-xs text-slate-500 font-medium">{type}</p>
        </div>
      </div>
      <div className="flex items-center gap-10">
        <div className="text-right">
          <p className="text-[10px] text-slate-400 uppercase font-extrabold tracking-widest">Shield Power</p>
          <p className="font-mono font-bold text-slate-800 text-lg">{100 - risk}%</p>
        </div>
        <span className={`status-badge ${statusColor}`}>
          {status}
        </span>
        <div className="bg-slate-50 p-2 rounded-lg group-hover:bg-primary-light transition-colors">
          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary" />
        </div>
      </div>
    </div>
  );
}
