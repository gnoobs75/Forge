import React, { useState } from 'react';
import { useStore } from '../../store/useStore';

const TECH_STACK_OPTIONS = [
  { id: 'react', label: 'React' },
  { id: 'vue', label: 'Vue' },
  { id: 'angular', label: 'Angular' },
  { id: 'nextjs', label: 'Next.js' },
  { id: 'node', label: 'Node.js' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'dotnet', label: '.NET' },
  { id: 'postgres', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL' },
  { id: 'mongodb', label: 'MongoDB' },
  { id: 'redis', label: 'Redis' },
  { id: 'docker', label: 'Docker' },
  { id: 'kubernetes', label: 'Kubernetes' },
  { id: 'aws', label: 'AWS' },
  { id: 'azure', label: 'Azure' },
  { id: 'gcp', label: 'GCP' },
  { id: 'typescript', label: 'TypeScript' },
];

const PHASE_OPTIONS = [
  { id: 'discovery', label: 'Discovery' },
  { id: 'design', label: 'Design' },
  { id: 'build', label: 'Build' },
  { id: 'test', label: 'Test' },
  { id: 'deploy', label: 'Deploy' },
  { id: 'maintain', label: 'Maintain' },
];

export default function NewProjectModal({ onClose }) {
  const addProject = useStore((s) => s.addProject);

  const [form, setForm] = useState({
    name: '',
    description: '',
    techStack: [],
    client: '',
    phase: 'discovery',
    repoPath: '',
    progress: 0,
    deadline: '',
    teamSize: '',
  });

  const [error, setError] = useState('');

  const slug = form.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const toggleTech = (id) => {
    setForm((f) => ({
      ...f,
      techStack: f.techStack.includes(id)
        ? f.techStack.filter((t) => t !== id)
        : [...f.techStack, id],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('Project name is required');
      return;
    }
    if (!form.client.trim()) {
      setError('Client is required');
      return;
    }

    const project = {
      slug,
      name: form.name.trim(),
      description: form.description.trim() || `${form.client} project`,
      techStack: form.techStack,
      platforms: form.techStack,
      client: form.client.trim(),
      phase: form.phase,
      repoPath: form.repoPath.trim(),
      progress: parseInt(form.progress) || 0,
      deadline: form.deadline || null,
      teamSize: parseInt(form.teamSize) || 0,
    };

    addProject(project);

    // Also save to hq-data if in Electron
    if (window.electronAPI?.hq) {
      window.electronAPI.hq.writeFile(
        `projects/${slug}/project.json`,
        JSON.stringify(project, null, 2)
      );
    }

    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
        <form
          onSubmit={handleSubmit}
          className="bg-forge-surface border border-forge-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-forge-border">
            <h2 className="text-sm font-mono font-bold text-forge-text-primary">
              Add New Project
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-forge-text-muted hover:text-forge-text-secondary transition-colors text-lg"
            >
              &times;
            </button>
          </div>

          {/* Form body */}
          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Name */}
            <Field label="Project Name" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Client Portal"
                className="input-field"
                autoFocus
              />
              {slug && (
                <div className="text-[10px] text-forge-text-muted mt-1">
                  slug: <code className="text-forge-accent">{slug}</code>
                </div>
              )}
            </Field>

            {/* Description */}
            <Field label="Description">
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="One-line description of the project"
                className="input-field"
              />
            </Field>

            {/* Client */}
            <Field label="Client" required>
              <input
                type="text"
                value={form.client}
                onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
                placeholder="e.g. Acme Corp"
                className="input-field"
              />
            </Field>

            {/* Tech Stack */}
            <Field label="Tech Stack">
              <div className="flex flex-wrap gap-2">
                {TECH_STACK_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTech(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      form.techStack.includes(t.id)
                        ? 'bg-forge-accent/20 border-forge-accent/40 text-forge-accent'
                        : 'bg-forge-bg/50 border-forge-border text-forge-text-muted hover:text-forge-text-secondary hover:border-forge-accent/20'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>

            {/* Deadline + Team Size row */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Deadline">
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                  className="input-field"
                />
              </Field>
              <Field label="Team Size">
                <input
                  type="number"
                  value={form.teamSize}
                  onChange={(e) => setForm((f) => ({ ...f, teamSize: e.target.value }))}
                  placeholder="1"
                  min="1"
                  className="input-field"
                />
              </Field>
            </div>

            {/* Phase + Progress row */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Current Phase">
                <select
                  value={form.phase}
                  onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))}
                  className="input-field"
                >
                  {PHASE_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Progress (%)">
                <input
                  type="number"
                  value={form.progress}
                  onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))}
                  placeholder="0"
                  min="0"
                  max="100"
                  className="input-field"
                />
              </Field>
            </div>

            {/* Repo Path */}
            <Field label="Repository Path (optional)">
              <input
                type="text"
                value={form.repoPath}
                onChange={(e) => setForm((f) => ({ ...f, repoPath: e.target.value }))}
                placeholder="C:\\Claude\\MyGame"
                className="input-field"
              />
              <div className="text-[10px] text-forge-text-muted mt-1">
                Agents will read this directory for project context
              </div>
            </Field>

            {error && (
              <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-forge-border bg-forge-bg/30">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-forge-text-secondary hover:text-forge-text-primary transition-colors"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary text-xs">
              Add Project
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium text-forge-text-secondary uppercase tracking-wider">
        {label}
        {required && <span className="text-forge-accent ml-0.5">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
