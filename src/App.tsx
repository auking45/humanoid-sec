/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Checklist, Target, RiskAnalysis, AIModel } from './types';
import { analyzeRobotRisk } from './services/aiService';

const MOCK_CHECKLIST: Checklist = {
  id: 'cl-1',
  title: 'Standard Robot Security Baseline',
  description: 'Essential security controls for autonomous mobile robots.',
  items: [
    { id: 'i1', text: 'Default passwords changed', category: 'Access Control', weight: 5 },
    { id: 'i2', text: 'Network traffic encrypted (TLS/SSL)', category: 'Network', weight: 4 },
    { id: 'i3', text: 'Physical ports disabled/locked', category: 'Physical', weight: 3 },
    { id: 'i4', text: 'Firmware update mechanism verified', category: 'Software', weight: 4 },
    { id: 'i5', text: 'Emergency stop functionality verified', category: 'Physical', weight: 5 },
    { id: 'i6', text: 'SSH access restricted to specific IPs', category: 'Network', weight: 3 },
  ]
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'checklists' | 'targets' | 'settings'>('dashboard');
  const [isAdmin, setIsAdmin] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTarget, setNewTarget] = useState({ name: '', type: '', description: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [selectedChecklist, setSelectedChecklist] = useState<Checklist | null>(null);
  const [showAddChecklistModal, setShowAddChecklistModal] = useState(false);
  const [newChecklist, setNewChecklist] = useState<Checklist>({
    id: '',
    title: '',
    description: '',
    items: []
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [targetsRes, checklistsRes] = await Promise.all([
          fetch('/api/targets'),
          fetch('/api/checklists')
        ]);
        
        if (targetsRes.ok && checklistsRes.ok) {
          const [targetsData, checklistsData] = await Promise.all([
            targetsRes.json(),
            checklistsRes.json()
          ]);
          setTargets(targetsData);
          setChecklists(checklistsData);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const activeChecklist = checklists[0]; // Default to first one for now

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
      riskScore: 0,
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
          <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-2 rounded-xl shadow-lg shadow-indigo-200">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="font-extrabold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
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
                <span className="text-indigo-600 font-semibold bg-indigo-50 px-3 py-1 rounded-full text-sm">{selectedTarget.name}</span>
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
                className="pl-10 pr-4 py-2 bg-white/50 border border-white/60 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all w-64"
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
                      onEdit={(cl) => {
                        setNewChecklist(cl);
                        setShowAddChecklistModal(true);
                      }}
                    />
                  : <ChecklistsListView 
                      checklists={checklists} 
                      onSelect={setSelectedChecklist} 
                      isAdmin={isAdmin}
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
                      onBack={() => setSelectedTarget(null)} 
                      onDelete={handleDeleteTarget}
                      onUpdate={handleUpdateTarget}
                    />
                  : <TargetsListView targets={filteredTargets} onSelect={setSelectedTarget} />
              )}
              {activeTab === 'settings' && <SettingsView isAdmin={isAdmin} setIsAdmin={setIsAdmin} />}
            </motion.div>
          </AnimatePresence>
        </div>
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
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-all"
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
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
                    <h4 className="text-xs font-extrabold text-indigo-400 uppercase tracking-widest">Checklist Items</h4>
                    <button 
                      onClick={() => setNewChecklist({
                        ...newChecklist,
                        items: [...newChecklist.items, { id: `i${Date.now()}`, text: '', category: 'Software', weight: 3 }]
                      })}
                      className="text-indigo-600 text-xs font-bold flex items-center gap-1 hover:underline"
                    >
                      <Plus className="w-3 h-3" /> Add Item
                    </button>
                  </div>
                  
                  {newChecklist.items.map((item, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 bg-indigo-600 text-white text-[10px] font-bold rounded-lg flex items-center justify-center shrink-0">
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
                            <option value="Access Control">Access Control</option>
                            <option value="System Security">System Security</option>
                            <option value="OS Hardening">OS Hardening</option>
                            <option value="Cloud Communication">Cloud Communication</option>
                            <option value="Local Network">Local Network</option>
                            <option value="Audit Logging">Audit Logging</option>
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
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-all"
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
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        active 
          ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-sm' 
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function DashboardView({ targets, onSelectTarget, onViewAll }: { targets: Target[], onSelectTarget: (t: Target) => void, onViewAll: () => void }) {
  const avgRisk = useMemo(() => {
    if (targets.length === 0) return 0;
    return Math.round(targets.reduce((acc, t) => acc + t.riskScore, 0) / targets.length);
  }, [targets]);

  const highRiskCount = useMemo(() => {
    return targets.filter(t => t.riskScore > 70).length;
  }, [targets]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Fleet Security Health" value={`${100 - avgRisk}%`} icon={<ShieldCheck className="text-indigo-600" />} trend="+2% from last week" />
        <StatCard label="Active Targets" value={targets.length.toString()} icon={<TargetIcon className="text-emerald-600" />} trend="+1 this week" />
        <StatCard label="Critical Alerts" value={highRiskCount.toString()} icon={<AlertTriangle className="text-rose-600" />} trend="Immediate action" />
        <StatCard label="Security Rank" value={avgRisk < 30 ? 'Sentinel' : avgRisk < 60 ? 'Guardian' : 'Initiate'} icon={<Trophy className="text-amber-500" />} trend="Next: Elite" />
      </div>

      <div className="glass-card rounded-3xl overflow-hidden">
        <div className="p-8 border-b border-white/20 flex items-center justify-between bg-white/30">
          <div>
            <h3 className="font-extrabold text-xl text-slate-800">Security Fleet Overview</h3>
            <p className="text-slate-500 text-sm mt-1">Real-time risk assessment of your autonomous fleet.</p>
          </div>
          <button 
            onClick={onViewAll}
            className="text-indigo-600 text-sm font-bold hover:text-indigo-700 bg-indigo-50 px-4 py-2 rounded-xl transition-all"
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

function ChecklistView({ checklist, onBack, isAdmin, onEdit }: { checklist: Checklist, onBack: () => void, isAdmin: boolean, onEdit: (cl: Checklist) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-slate-500 hover:text-indigo-600 flex items-center gap-2 text-sm font-bold transition-all bg-white/50 px-4 py-2 rounded-xl border border-white/60">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Back to Checklists
        </button>
        {isAdmin && (
          <button 
            onClick={() => onEdit(checklist)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
          >
            <Settings className="w-4 h-4" />
            Edit Checklist
          </button>
        )}
      </div>
      <div className="glass-card p-10 rounded-3xl">
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-100">
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
                <span className="bg-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-md group-hover:scale-110 transition-transform">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <p className="font-bold text-slate-800 text-lg">{item.text}</p>
                  <div className="flex items-center gap-4 mt-3">
                    <span className="text-[10px] uppercase font-extrabold tracking-widest px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg">
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
              {expandedId === item.id && item.description && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="mt-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 text-sm text-slate-600 leading-relaxed font-medium"
                >
                  {item.description}
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChecklistsListView({ checklists, onSelect, onCreate, onEdit, isAdmin }: { checklists: Checklist[], onSelect: (cl: Checklist) => void, onCreate: () => void, onEdit: (cl: Checklist) => void, isAdmin: boolean }) {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">Security Checklists</h3>
          <p className="text-slate-500 font-medium mt-1">Standardized security controls for different robot classes.</p>
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
            className="glass-card p-8 rounded-3xl hover:shadow-indigo-100 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
          >
            <div onClick={() => onSelect(cl)}>
              <div className="flex items-center gap-4 mb-6">
                <div className="bg-indigo-50 p-4 rounded-2xl group-hover:bg-indigo-600 transition-all duration-300">
                  <ClipboardCheck className="w-6 h-6 text-indigo-600 group-hover:text-white" />
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
                    className="p-2 bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                  >
                    <Settings className="w-5 h-5" />
                  </button>
                )}
                <div onClick={() => onSelect(cl)} className="bg-slate-50 p-2 rounded-lg group-hover:bg-indigo-50 transition-colors">
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" />
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
          className="glass-card p-8 rounded-3xl hover:shadow-indigo-100 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full -mr-8 -mt-8 group-hover:bg-indigo-500/10 transition-colors" />
          
          <div className="flex items-center justify-between mb-6">
            <div className="p-4 bg-indigo-50 rounded-2xl group-hover:bg-indigo-600 transition-all duration-300">
              <TargetIcon className="w-6 h-6 text-indigo-600 group-hover:text-white" />
            </div>
            <div className={`status-badge ${
              target.riskScore > 70 ? 'bg-rose-50 text-rose-600 border-rose-100' : 
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
            <div className="bg-slate-50 p-2 rounded-lg group-hover:bg-indigo-50 transition-colors">
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TargetDetailView({ target, checklist, onBack, onDelete, onUpdate }: { target: Target, checklist: Checklist, onBack: () => void, onDelete: (id: string) => void, onUpdate: (t: Target) => void }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<RiskAnalysis | null>(null);
  const [selectedModel, setSelectedModel] = useState<AIModel>('gemini-3-flash-preview');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const riskScore = useMemo(() => {
    const results = target.checklistResults[checklist.id] || {};
    const totalWeight = checklist.items.reduce((acc, item) => acc + item.weight, 0);
    const failedWeight = checklist.items.reduce((acc, item) => {
      return acc + (results[item.id] ? 0 : item.weight);
    }, 0);
    return Math.round((failedWeight / totalWeight) * 100);
  }, [target, checklist]);

  const toggleItem = (itemId: string) => {
    const currentResults = target.checklistResults[checklist.id] || {};
    const newResults = {
      ...target.checklistResults,
      [checklist.id]: {
        ...currentResults,
        [itemId]: !currentResults[itemId]
      }
    };
    onUpdate({ ...target, checklistResults: newResults, riskScore });
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
        <button onClick={onBack} className="text-slate-500 hover:text-indigo-600 flex items-center gap-2 text-sm font-bold transition-all bg-white/50 px-4 py-2 rounded-xl border border-white/60">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Back to Fleet
        </button>
        <button 
          onClick={() => { if(confirm('Are you sure you want to decommission this target?')) onDelete(target.id); }}
          className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-bold transition-all"
        >
          <Trash2 className="w-4 h-4" />
          Decommission Target
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="glass-card p-10 rounded-3xl">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">Security Hardening</h3>
                <p className="text-slate-500 font-medium mt-1">Interactive checklist to reduce system vulnerability.</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">AI Engine</span>
                  <select 
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value as AIModel)}
                    className="bg-white/50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
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
                const completed = target.checklistResults[checklist.id]?.[item.id];
                return (
                  <div 
                    key={item.id} 
                    className={`flex flex-col gap-2 p-6 rounded-2xl border-2 transition-all ${
                      completed 
                        ? 'border-emerald-200 bg-emerald-50/50 shadow-inner' 
                        : 'border-slate-100 bg-white/40 hover:border-indigo-200 hover:bg-white/60'
                    }`}
                  >
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleItem(item.id)}>
                      <div className="flex items-center gap-5">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                          completed ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200'
                        }`}>
                          {completed && <CheckCircle2 className="w-4 h-4 text-white" />}
                        </div>
                        <span className={`text-lg font-bold ${completed ? 'text-emerald-700' : 'text-slate-600'}`}>
                          {item.text}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] uppercase font-extrabold tracking-widest px-3 py-1 bg-white/80 rounded-lg text-slate-500 border border-slate-100">
                          {item.category}
                        </span>
                      </div>
                    </div>
                    {item.description && (
                      <div 
                        onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                        className="mt-1 ml-11 text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer w-fit"
                      >
                        {expandedId === item.id ? 'Hide Details' : 'View Detailed Requirements'}
                      </div>
                    )}
                    {expandedId === item.id && item.description && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="mt-3 ml-11 p-4 bg-slate-50/80 rounded-xl border border-slate-200 text-sm text-slate-600 leading-relaxed"
                      >
                        {item.description}
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
                <Shield className="w-32 h-32 text-indigo-600" />
              </div>
              
              <div className="flex items-center justify-between relative z-10">
                <h4 className="text-2xl font-extrabold text-slate-900 flex items-center gap-3">
                  <div className="bg-indigo-100 p-2 rounded-xl">
                    <Shield className="w-6 h-6 text-indigo-600" />
                  </div>
                  AI Security Intelligence
                </h4>
                <span className={`status-badge ${
                  analysis.severity === 'Critical' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                  analysis.severity === 'High' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                  analysis.severity === 'Medium' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                  'bg-emerald-100 text-emerald-700 border-emerald-200'
                }`}>
                  {analysis.severity} Risk Level
                </span>
              </div>
              
              <div className="p-6 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 relative z-10">
                <p className="text-slate-700 leading-relaxed font-medium">{analysis.summary}</p>
              </div>

              <div className="space-y-4 relative z-10">
                <h5 className="text-xs font-extrabold text-indigo-400 uppercase tracking-[0.2em]">Strategic Recommendations</h5>
                <div className="grid gap-3">
                  {analysis.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-4 p-4 bg-white/40 rounded-xl border border-white/60">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
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
              <div className={`absolute inset-0 blur-3xl opacity-20 -z-10 rounded-full ${
                riskScore > 70 ? 'bg-rose-500' : riskScore > 40 ? 'bg-amber-500' : 'bg-emerald-500'
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

function StatCard({ label, value, icon, trend }: { label: string, value: string, icon: React.ReactNode, trend?: string }) {
  return (
    <div className="glass-card p-6 rounded-3xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 bg-white/50 rounded-2xl shadow-sm">{icon}</div>
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

interface TargetRowProps {
  name: string;
  type: string;
  risk: number;
  status: string;
  onClick: () => void;
}

function SettingsView({ isAdmin, setIsAdmin }: { isAdmin: boolean, setIsAdmin: (val: boolean) => void }) {
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
            <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-100">
              <Settings className="w-8 h-8 text-white" />
            </div>
            <div>
              <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">System Settings</h3>
              <p className="text-slate-500 font-medium mt-1">Configure your AI engines and fleet parameters.</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isAdmin ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 border border-slate-200 shadow-sm'}`}>
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Researcher Mode</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Enable Editing</p>
              </div>
            </div>
            <button 
              onClick={() => setIsAdmin(!isAdmin)}
              className={`w-14 h-7 rounded-full transition-all relative ${isAdmin ? 'bg-indigo-600' : 'bg-slate-200'}`}
            >
              <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all ${isAdmin ? 'left-8' : 'left-1'}`} />
            </button>
          </div>
        </div>

        <div className="space-y-10">
          <section>
            <h4 className="text-xs font-extrabold text-indigo-400 uppercase tracking-[0.2em] mb-6">AI Engine Integration</h4>
            <div className="grid gap-4">
              {[
                { name: 'Gemini 3 Flash', id: 'gemini', provider: 'Google', status: aiStatus.gemini, icon: <Sparkles className="text-indigo-600" /> },
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
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest border ${
                      engine.status === 'Connected' 
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                        : 'bg-slate-50 text-slate-400 border-slate-100'
                    }`}>
                      {engine.status}
                    </span>
                    {engine.status !== 'Connected' && (
                      <button className="text-indigo-600 text-xs font-extrabold hover:underline">
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
            <h4 className="text-xs font-extrabold text-indigo-400 uppercase tracking-[0.2em] mb-6">Fleet Management</h4>
            <div className="p-8 bg-slate-50 rounded-2xl border border-slate-100 text-center">
              <p className="text-slate-500 font-medium">Additional fleet configuration options will be available in future updates.</p>
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
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:bg-indigo-600 transition-all duration-300">
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
        <div className="bg-slate-50 p-2 rounded-lg group-hover:bg-indigo-50 transition-colors">
          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600" />
        </div>
      </div>
    </div>
  );
}
