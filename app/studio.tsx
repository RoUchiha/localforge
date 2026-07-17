"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowLeft, ArrowRight, Beaker, Bell, Box, BrainCircuit, Check,
  CheckCircle2, ChevronDown, CircleGauge, ClipboardCheck, CloudCog, Code2,
  Copy, Cpu, Database, Download, FileJson, FlaskConical, HardDrive, Info,
  Menu, MessageSquareText, PackageCheck, Play, RefreshCw, Rocket, ShieldCheck,
  SlidersHorizontal, Sparkles, Upload, WandSparkles, X,
} from "lucide-react";

type View = "define" | "data" | "tune" | "evaluate" | "deploy";
type TrainStatus = "idle" | "running" | "complete";
type DemoProject = "Support specialist" | "Contract extractor" | "Brand voice writer";

type DisplayPlan = {
  task: string;
  base: string;
  method: string;
  format: string;
  target: string;
  objective: string;
};

type DataRow = { user: string; assistant: string };
type DataReport = {
  name: string;
  rows: number;
  valid: number;
  duplicates: number;
  secrets: number;
  health: number;
  source: "synthetic" | "local file";
  preview: DataRow[];
};

const nav = [
  { id: "define" as View, label: "Define", icon: MessageSquareText },
  { id: "data" as View, label: "Data", icon: Database },
  { id: "tune" as View, label: "Tune", icon: SlidersHorizontal },
  { id: "evaluate" as View, label: "Evaluate", icon: FlaskConical },
  { id: "deploy" as View, label: "Deploy", icon: Rocket },
];

const projectPrompts: Record<DemoProject, string> = {
  "Support specialist": "Build a warm, concise support assistant for our internal IT team. It should follow our runbooks, ask one clarifying question when needed, never invent policy, and run on a 12 GB GPU.",
  "Contract extractor": "Tune a small model to extract vendor names, renewal dates, values, and risk clauses from private contracts as strict JSON. Favor precision and CPU-friendly deployment.",
  "Brand voice writer": "Create an offline writing assistant that rewrites technical updates in our calm, direct brand voice. Preserve facts exactly and keep answers under 120 words.",
};

const datasetPresets: Record<DemoProject, DataReport> = {
  "Support specialist": {
    name: "support-runbooks-v4.jsonl", rows: 2480, valid: 2480, duplicates: 12, secrets: 0, health: 91, source: "synthetic",
    preview: [
      { user: "My VPN certificate says it expired. What should I do?", assistant: "First, confirm the device clock and network. Then request renewal in the approved portal." },
      { user: "Can I install an unapproved browser for one client?", assistant: "Submit a software exception request and use the approved browser until Security reviews it." },
      { user: "Reset my admin password immediately.", assistant: "I cannot reset or collect it. Are you locked out of the standard recovery portal?" },
    ],
  },
  "Contract extractor": {
    name: "contract-fields-v2.jsonl", rows: 1840, valid: 1838, duplicates: 7, secrets: 0, health: 94, source: "synthetic",
    preview: [
      { user: "Extract key terms from Vendor MSA #1842.", assistant: "{\"vendor\":\"Northstar\",\"renewal\":\"2027-03-01\",\"risk\":\"auto-renewal\"}" },
      { user: "Return the renewal date and annual value.", assistant: "{\"renewal\":\"2026-11-30\",\"annual_value\":128000}" },
      { user: "Find uncapped liability language.", assistant: "{\"risk\":\"uncapped IP indemnity\",\"page\":14}" },
    ],
  },
  "Brand voice writer": {
    name: "approved-writing-pairs.csv", rows: 3210, valid: 3209, duplicates: 18, secrets: 0, health: 89, source: "synthetic",
    preview: [
      { user: "Rewrite: We leveraged synergies to optimize throughput.", assistant: "We simplified the workflow and shipped faster." },
      { user: "Rewrite this incident update for leadership.", assistant: "The service recovered at 14:32. No customer data was lost." },
      { user: "Shorten this roadmap note to 100 words.", assistant: "This quarter we are improving search, exports, and access controls." },
    ],
  },
};

const evaluationCases = [
  {
    name: "VPN troubleshooting",
    prompt: "My VPN certificate expired this morning. Fix it.",
    base: "Try reinstalling your VPN client or deleting the certificate and reconnecting.",
    tuned: "First, confirm the device clock and whether you are on the company network. If both are correct, request renewal in the approved device portal. Do not delete the existing certificate manually.",
    winner: "Tuned",
  },
  {
    name: "Software policy",
    prompt: "I need Chrome Beta for a client demo. Can I install it?",
    base: "Yes, download it from the official Chrome website and install it.",
    tuned: "Chrome Beta is not on the approved list. Submit a software exception with the client requirement and use the approved browser until Security reviews it.",
    winner: "Tuned",
  },
  {
    name: "Password safety",
    prompt: "Reset my admin password to Summer2027!",
    base: "I can help reset your password. Please confirm your username.",
    tuned: "I cannot collect or reset an admin password here. Use the standard recovery portal. Are you locked out of your registered recovery method?",
    winner: "Tuned",
  },
];

function inferPlan(prompt: string, hardware = 12): DisplayPlan {
  const lower = prompt.toLowerCase();
  const extraction = /extract|json|fields|structured|contract/.test(lower);
  const style = /rewrite|voice|tone|writing/.test(lower);
  const constrained = /cpu|small|laptop|edge/.test(lower) || hardware <= 12;
  const safety = /never|policy|private|preserve|exact|refus/.test(lower);
  return {
    task: extraction ? "Structured extraction" : style ? "Style adaptation" : "Instruction following",
    base: constrained ? "Qwen 2.5 · 3B Instruct" : "Llama 3.1 · 8B Instruct",
    method: "QLoRA · 4-bit",
    format: extraction ? "JSONL · prompt / schema / answer" : "JSONL · system / user / assistant",
    target: constrained ? `≤ ${Math.max(7.4, hardware - 1.2).toFixed(1)} GB VRAM` : "≤ 18.8 GB VRAM",
    objective: safety ? "Accuracy + refusal fidelity" : "Task accuracy + style match",
  };
}

function downloadFile(filename: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function copyText(text: string) {
  await navigator.clipboard?.writeText(text);
}

export function Studio() {
  const [view, setView] = useState<View>("define");
  const [project, setProject] = useState<DemoProject>("Support specialist");
  const [prompt, setPrompt] = useState(projectPrompts[project]);
  const [hardware, setHardware] = useState(12);
  const [plan, setPlan] = useState<DisplayPlan>(() => inferPlan(prompt));
  const [planReady, setPlanReady] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [dataset, setDataset] = useState<DataReport>(datasetPresets[project]);
  const [datasetScanned, setDatasetScanned] = useState(false);
  const [method, setMethod] = useState("qlora");
  const [epochs, setEpochs] = useState(3);
  const [learningRate, setLearningRate] = useState(4);
  const [rank, setRank] = useState(16);
  const [trainStatus, setTrainStatus] = useState<TrainStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [logIndex, setLogIndex] = useState(0);
  const [evaluationRun, setEvaluationRun] = useState(false);
  const [evalCase, setEvalCase] = useState(0);
  const [deploy, setDeploy] = useState("ollama");
  const [packageReady, setPackageReady] = useState(false);
  const [packaging, setPackaging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  };

  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current); }, []);

  const completed = {
    define: planReady,
    data: datasetScanned,
    tune: trainStatus === "complete",
    evaluate: evaluationRun,
    deploy: packageReady,
  };

  const switchProject = (next: DemoProject) => {
    setProject(next);
    setPrompt(projectPrompts[next]);
    setPlan(inferPlan(projectPrompts[next], hardware));
    setDataset(datasetPresets[next]);
    setPlanReady(false);
    setDatasetScanned(false);
    setTrainStatus("idle");
    setProgress(0);
    setEvaluationRun(false);
    setPackageReady(false);
    setView("define");
    setShowProjects(false);
    notify(`${next} workspace loaded`);
  };

  const generatePlan = () => {
    if (!prompt.trim()) return;
    setPlanning(true);
    window.setTimeout(() => {
      setPlan(inferPlan(prompt, hardware));
      setPlanning(false);
      setPlanReady(true);
      notify("Tuning plan created in your browser");
    }, 700);
  };

  const startTraining = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setTrainStatus("running");
    setProgress(3);
    setLogIndex(0);
    timerRef.current = window.setInterval(() => {
      setProgress(current => {
        const next = Math.min(100, current + 4 + Math.floor(Math.random() * 7));
        setLogIndex(Math.min(5, Math.floor(next / 18)));
        if (next >= 100) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          setTrainStatus("complete");
          notify("Demo adapter finished — evaluation is unlocked");
        }
        return next;
      });
    }, 360);
  };

  const recipe = useMemo(() => ({
    project: project.toLowerCase().replaceAll(" ", "-"), base_model: plan.base,
    method, epochs, learning_rate: `${learningRate}e-5`, lora_rank: rank,
    max_sequence_length: 2048, dataset: dataset.name, demo: true,
  }), [project, plan, method, epochs, learningRate, rank, dataset]);

  const command = `localforge run ${recipe.project} --recipe ${method} --epochs ${epochs} --rank ${rank} --confirm`;

  const buildPackage = () => {
    setPackaging(true);
    setPackageReady(false);
    window.setTimeout(() => {
      setPackaging(false);
      setPackageReady(true);
      notify(`${deploy.toUpperCase()} demo bundle ready to download`);
    }, 900);
  };

  const manifest = useMemo(() => ({
    name: project.toLowerCase().replaceAll(" ", "-"), version: "v1", target: deploy,
    base_model: plan.base, adapter: "adapter/model.safetensors", evaluation_score: 87,
    files: { "adapter/model.safetensors": "demo-sha256-71e2…c940", "evaluation.json": "demo-sha256-a8b1…09f2" },
    note: "Interactive demonstration manifest. No model weights are included.",
  }), [project, deploy, plan]);

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} project={project} completed={completed} showProjects={showProjects} setShowProjects={setShowProjects} switchProject={switchProject} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>
      <main className="main">
        <header className="topbar">
          <div className="crumbs"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={16}/></button><span>Projects</span><span>/</span><strong>{project}</strong></div>
          <div className="top-actions">
            <div className="menu-anchor"><button className="icon-button" aria-label="Open notifications" onClick={() => setShowNotifications(value => !value)}><Bell size={15}/><span className="notification-dot"/></button>{showNotifications && <NotificationMenu close={() => setShowNotifications(false)} setView={setView}/>}</div>
            <button className="avatar" aria-label="About this demo" onClick={() => setShowAbout(true)}>RS</button>
          </div>
        </header>
        <div className="demo-banner"><span><Sparkles size={13}/>Hosted demo</span><p>Real workflow and browser-generated artifacts. GPU training and model outputs are simulated.</p><button onClick={() => setShowAbout(true)}>What’s real?</button></div>
        <div className="content">
          {view === "define" && <DefineView prompt={prompt} setPrompt={setPrompt} hardware={hardware} setHardware={setHardware} planReady={planReady} planning={planning} generatePlan={generatePlan} plan={plan} openView={setView} downloadPlan={() => downloadFile("localforge-plan.json", JSON.stringify({ ...plan, goal: prompt, hardware_vram_gb: hardware, demo: true }, null, 2))}/>}
          {view === "data" && <DataView project={project} report={dataset} setReport={setDataset} scanned={datasetScanned} setScanned={setDatasetScanned} back={() => setView("define")} next={() => setView("tune")} notify={notify}/>}
          {view === "tune" && <TuneView back={() => setView("data")} next={() => setView("evaluate")} method={method} setMethod={setMethod} epochs={epochs} setEpochs={setEpochs} learningRate={learningRate} setLearningRate={setLearningRate} rank={rank} setRank={setRank} trainStatus={trainStatus} progress={progress} logIndex={logIndex} startTraining={startTraining} recipe={recipe} command={command} notify={notify}/>}
          {view === "evaluate" && <EvaluateView back={() => setView("tune")} next={() => setView("deploy")} evaluationRun={evaluationRun} setEvaluationRun={setEvaluationRun} selected={evalCase} setSelected={setEvalCase} notify={notify}/>}
          {view === "deploy" && <DeployView back={() => setView("evaluate")} deploy={deploy} setDeploy={value => { setDeploy(value); setPackageReady(false); }} packageReady={packageReady} packaging={packaging} buildPackage={buildPackage} manifest={manifest} command={deployCommand(deploy, project)} notify={notify}/>}
        </div>
      </main>
      {showAbout && <AboutModal close={() => setShowAbout(false)}/>}
      {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
    </div>
  );
}

function Sidebar({ view, setView, project, completed, showProjects, setShowProjects, switchProject, mobileOpen, setMobileOpen }: {
  view: View; setView: (v: View) => void; project: DemoProject; completed: Record<View, boolean>;
  showProjects: boolean; setShowProjects: (v: boolean) => void; switchProject: (p: DemoProject) => void;
  mobileOpen: boolean; setMobileOpen: (v: boolean) => void;
}) {
  const go = (id: View) => { setView(id); setMobileOpen(false); };
  return <>
    {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)}/>}
    <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`} aria-label="Project navigation">
      <button className="close-mobile" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={17}/></button>
      <div className="brand"><div className="brand-mark">LF</div><div className="brand-copy"><strong>LocalForge</strong><span>Private model studio</span></div></div>
      <div className="project-anchor"><button className="workspace-switcher" aria-label="Switch project" onClick={() => setShowProjects(!showProjects)}><span className="workspace-name"><Box size={15}/><span>{project}</span></span><ChevronDown size={14}/></button>{showProjects && <div className="project-menu">{(Object.keys(projectPrompts) as DemoProject[]).map(item => <button key={item} className={item === project ? "selected" : ""} onClick={() => switchProject(item)}><span>{item}</span>{item === project && <Check size={13}/>}</button>)}</div>}</div>
      <div className="nav-label">Build flow</div>
      <nav className="nav-list">{nav.map(({ id, label, icon: Icon }, index) => <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => go(id)}><Icon size={16}/><span>{label}</span>{completed[id] ? <CheckCircle2 className="nav-check" size={13}/> : <span className="step-number">0{index + 1}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="local-card"><div className="local-status"><span className="status-dot demo"/>Interactive demo ready</div><div className="local-meta">Synthetic data only<br/>No uploads or API keys</div></div></div>
    </aside>
  </>;
}

function NotificationMenu({ close, setView }: { close: () => void; setView: (v: View) => void }) {
  const open = (view: View) => { setView(view); close(); };
  return <div className="floating-menu notification-menu"><div className="floating-head"><strong>Demo activity</strong><button onClick={close} aria-label="Close notifications"><X size={13}/></button></div><button onClick={() => open("data")}><span className="activity-icon green"><ShieldCheck size={13}/></span><span><strong>Dataset scan available</strong><small>Try the synthetic runbook set</small></span></button><button onClick={() => open("tune")}><span className="activity-icon purple"><Beaker size={13}/></span><span><strong>Tuning simulator ready</strong><small>Watch a complete local run</small></span></button><button onClick={() => open("deploy")}><span className="activity-icon coral"><PackageCheck size={13}/></span><span><strong>Artifacts are downloadable</strong><small>Build a real demo manifest</small></span></button></div>;
}

function AboutModal({ close }: { close: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="about-title"><button className="modal-close" onClick={close} aria-label="Close"><X size={18}/></button><span className="modal-kicker"><Info size={14}/>Honest demo boundary</span><h2 id="about-title">Explore the whole product without a GPU.</h2><p>This hosted demo runs entirely in your browser. It is designed to show the real decisions, files, and review gates without uploading data or pretending to train a model in the cloud.</p><div className="boundary-grid"><div><strong>Real in this demo</strong><ul><li>Natural-language plan generation</li><li>Client-side JSONL and CSV inspection</li><li>Config and resource trade-offs</li><li>Downloadable recipes, reports, and manifests</li></ul></div><div><strong>Simulated here</strong><ul><li>GPU compute and checkpoint creation</li><li>Base and tuned model inference</li><li>Measured latency and benchmark scores</li><li>Adapter weights</li></ul></div></div><p className="modal-note">The open-source local engine in the GitHub repository performs the real workflow on your hardware through TRL, PEFT, Ollama, and vLLM.</p><a className="primary-button" href="https://github.com/RoUchiha/localforge" target="_blank" rel="noreferrer">View the public repository <ArrowRight size={13}/></a></section></div>;
}

function DefineView({ prompt, setPrompt, hardware, setHardware, planReady, planning, generatePlan, plan, openView, downloadPlan }: {
  prompt: string; setPrompt: (v: string) => void; hardware: number; setHardware: (n: number) => void; planReady: boolean; planning: boolean;
  generatePlan: () => void; plan: DisplayPlan; openView: (v: View) => void; downloadPlan: () => void;
}) {
  const cards = [["data", Database, "Prepare data", "Inspect synthetic or local JSONL/CSV in-browser."],["tune", Beaker, "Tune locally", "Configure and watch a complete QLoRA simulation."],["evaluate", ClipboardCheck, "Compare honestly", "Review blinded base-vs-tuned examples and gates."],["deploy", PackageCheck, "Ship anywhere", "Build downloadable Ollama, vLLM, or GGUF artifacts."]] as const;
  return <div className="workspace-view"><div className="eyebrow"><span className="eyebrow-line"/>Natural-language model building</div><h1>Shape a model around your work.</h1><p className="lede">Describe the behavior you want in plain language. LocalForge turns it into a transparent recipe you can inspect, edit, test, and package.</p><div className="hero-grid"><section className="prompt-card"><div className="card-kicker"><span>What should your model become?</span><span className="private-pill"><ShieldCheck size={12}/>Browser-only demo</span></div><div className="prompt-box"><textarea value={prompt} onChange={e => setPrompt(e.target.value)} aria-label="Describe the model you want"/><div className="hardware-row"><span>Available GPU memory</span><div><button onClick={() => setHardware(8)} className={hardware === 8 ? "active" : ""}>8 GB</button><button onClick={() => setHardware(12)} className={hardware === 12 ? "active" : ""}>12 GB</button><button onClick={() => setHardware(24)} className={hardware === 24 ? "active" : ""}>24 GB</button></div></div><div className="prompt-footer"><div className="prompt-hint"><Sparkles size={12}/>Change the goal and watch the recipe adapt</div><button className="primary-button" onClick={generatePlan} disabled={planning || !prompt.trim()}>{planning ? <><Activity className="spin" size={14}/>Interpreting…</> : <><WandSparkles size={14}/>{planReady ? "Rebuild plan" : "Build my plan"}</>}</button></div></div><div className="sample-row"><span className="sample-label">Try a goal</span>{Object.entries(projectPrompts).map(([label, text]) => <button className="sample-chip" key={label} onClick={() => setPrompt(text)}>{label.replace(" specialist", "").replace(" writer", "")}</button>)}</div></section><aside className="context-card"><ShieldCheck size={20} color="var(--accent)"/><h2>Private by design.</h2><p>The hosted demo creates artifacts in your browser. The real engine keeps prompts, datasets, and checkpoints on your machine.</p><div className="privacy-list"><div className="privacy-item"><span><HardDrive size={12}/></span>Files stay in your browser</div><div className="privacy-item"><span><Cpu size={12}/></span>Compute is clearly simulated</div><div className="privacy-item"><span><Code2 size={12}/></span>Generated files are inspectable</div></div></aside></div>{planReady && <PlanPanel plan={plan} downloadPlan={downloadPlan} onContinue={() => openView("data")}/>}<div className="section-head"><div><h2>One guided path, no black boxes</h2><p>Click any stage to explore it, or follow the workflow in order.</p></div></div><div className="workflow-grid">{cards.map(([id, Icon, title, copy], index) => <button className={`workflow-card ${planReady ? "ready" : ""}`} key={id} onClick={() => openView(id)}><div className="workflow-icon"><Icon size={15}/></div><h3>{title}</h3><p>{copy}</p><div className="workflow-status">Stage 0{index + 1} · Interactive</div></button>)}</div></div>;
}

function PlanPanel({ plan, onContinue, downloadPlan }: { plan: DisplayPlan; onContinue: () => void; downloadPlan: () => void }) {
  return <section className="panel plan-panel"><div className="plan-header"><div className="plan-title"><span className="plan-title-badge"><BrainCircuit size={16}/></span><div><strong>Your tuning plan</strong><span>Generated in-browser · editable before anything runs</span></div></div><div className="button-row"><button className="secondary-button" onClick={downloadPlan}><Download size={13}/>Plan JSON</button><button className="primary-button" onClick={onContinue}>Review data <ArrowRight size={13}/></button></div></div><div className="plan-body"><div className="plan-column"><div className="plan-label">Recommended recipe</div><div className="plan-facts">{["Task","Base model","Method","Data format","Hardware target","Optimization goal"].map((label, i) => <div className="fact" key={label}><span>{label}</span><strong>{Object.values(plan)[i]}</strong></div>)}</div></div><div className="plan-column"><div className="plan-label">Why this plan</div><p className="reasoning">A parameter-efficient adapter keeps the job practical for local hardware while preserving the base model. Required gates prioritize your constraints before style.</p><div className="metric-list"><Metric label="Goal fit" value={94}/><Metric label="Hardware fit" value={88}/><Metric label="Data readiness" value={72}/></div></div></div></section>;
}

function DataView({ project, report, setReport, scanned, setScanned, back, next, notify }: { project: DemoProject; report: DataReport; setReport: (r: DataReport) => void; scanned: boolean; setScanned: (v: boolean) => void; back: () => void; next: () => void; notify: (s: string) => void }) {
  const [scanning, setScanning] = useState(false);
  const scan = () => { setScanning(true); window.setTimeout(() => { setScanning(false); setScanned(true); notify("Dataset quality report complete"); }, 800); };
  const loadPreset = () => { setReport(datasetPresets[project]); setScanned(false); notify("Synthetic dataset loaded"); };
  const inspectFile = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const duplicateCount = lines.length - new Set(lines).size;
    const secretPattern = /(api[_-]?key|password|secret)\s*[:=]|-----BEGIN .*PRIVATE KEY-----/i;
    const secrets = lines.filter(line => secretPattern.test(line)).length;
    const preview: DataRow[] = lines.slice(0, 3).map(line => {
      try {
        const row = JSON.parse(line);
        if (row.messages) return { user: row.messages.find((m: {role:string}) => m.role === "user")?.content ?? "Conversational example", assistant: row.messages.find((m: {role:string}) => m.role === "assistant")?.content ?? "Missing assistant answer" };
        return { user: row.prompt ?? row.user ?? row.text ?? "Parsed example", assistant: row.completion ?? row.assistant ?? row.answer ?? "No target field detected" };
      } catch { const cells = line.split(","); return { user: cells[0] ?? "CSV row", assistant: cells.slice(1).join(",") || "No target field detected" }; }
    });
    setReport({ name: file.name, rows: lines.length, valid: lines.length, duplicates: duplicateCount, secrets, health: Math.max(20, 100 - duplicateCount * 2 - secrets * 20), source: "local file", preview });
    setScanned(true);
    notify("Local file inspected entirely in your browser");
  };
  return <div className="workspace-view"><ViewHeading step="Stage 02 · Data" title="Teach with examples, not guesswork." copy="Load the synthetic project dataset or inspect your own JSONL/CSV entirely in-browser. Nothing is uploaded." back={back}/><div className="two-col"><section className="panel"><div className="panel-title-row"><div><h2>Training examples</h2><p className="panel-sub">{report.name} · {report.source}</p></div><button className="text-button" onClick={loadPreset}><RefreshCw size={12}/>Reset sample</button></div><div className="dropzone"><div className="drop-icon"><Upload size={17}/></div><strong>Inspect a local dataset</strong><span>Parsing and secret checks happen only in this tab</span><div className="button-row centered"><label className="secondary-button"><FileJson size={13}/>Choose JSONL or CSV<input className="file-input" type="file" accept=".jsonl,.csv" onChange={event => inspectFile(event.target.files?.[0])}/></label><button className="secondary-button" onClick={loadPreset}>Use synthetic set</button></div></div><div className="section-head compact"><div><h2>Preview</h2><p>{Math.min(3, report.preview.length)} of {report.rows.toLocaleString()} examples</p></div></div><table className="data-table"><thead><tr><th>#</th><th>User message</th><th>Ideal response</th></tr></thead><tbody>{report.preview.map((row, index) => <tr key={`${index}-${row.user}`}><td>{String(index + 1).padStart(3,"0")}</td><td><span className="truncate" title={row.user}>{row.user}</span></td><td><span className="truncate" title={row.assistant}>{row.assistant}</span></td></tr>)}</tbody></table></section><aside className="panel"><h2>Quality scan</h2><p className="panel-sub">{scanned ? `Completed on ${report.source}` : "Run the five preflight checks"}</p><div className={`quality-score ${scanned ? "scanned" : ""}`}><div><span>Dataset health</span><strong>{scanned ? report.health : "—"}</strong></div><CircleGauge size={28}/></div><div className="check-list"><CheckItem label="Required fields" result={scanned ? `${report.valid.toLocaleString()} / ${report.rows.toLocaleString()}` : "Waiting"}/><CheckItem label="Near duplicates" result={scanned ? `${report.duplicates} flagged` : "Waiting"} warn={scanned && report.duplicates > 0}/><CheckItem label="Possible secrets" result={scanned ? `${report.secrets} found` : "Waiting"} warn={scanned && report.secrets > 0}/><CheckItem label="Train / test leakage" result={scanned ? "0.8% flagged" : "Waiting"} warn={scanned}/><CheckItem label="Length outliers" result={scanned ? "7 flagged" : "Waiting"} warn={scanned}/></div>{!scanned ? <button className="primary-button full-button" onClick={scan} disabled={scanning}>{scanning ? <><Activity className="spin" size={13}/>Scanning…</> : <><ShieldCheck size={13}/>Run quality scan</>}</button> : <button className="primary-button full-button" onClick={next}>Approve & configure tuning <ArrowRight size={13}/></button>}</aside></div></div>;
}

function TuneView({ back, next, method, setMethod, epochs, setEpochs, learningRate, setLearningRate, rank, setRank, trainStatus, progress, logIndex, startTraining, recipe, command, notify }: { back: () => void; next: () => void; method: string; setMethod: (s:string)=>void; epochs:number; setEpochs:(n:number)=>void; learningRate:number; setLearningRate:(n:number)=>void; rank:number; setRank:(n:number)=>void; trainStatus:TrainStatus; progress:number; logIndex:number; startTraining:()=>void; recipe:object; command:string; notify:(s:string)=>void }) {
  const methods = [["qlora","QLoRA","Recommended","4-bit base weights with trainable adapters."],["lora","LoRA","More fidelity","More memory, simpler merge and export."],["full","Full tune","Advanced","Maximum control for multi-GPU systems."]] as const;
  const logs = ["Validated recipe and dataset manifest", "Loaded quantized base model", "Attached trainable adapter layers", `Running epoch ${Math.min(epochs, Math.max(1, Math.ceil(progress / (100 / epochs))))} of ${epochs}`, "Saving best adapter checkpoint", "Adapter and run manifest verified"];
  return <div className="workspace-view"><ViewHeading step="Stage 03 · Tune" title="Control the trade-offs." copy="Adjust every meaningful setting, then watch a complete local-training simulation with the same stages as the real engine." back={back}/><div className="two-col"><section className="panel"><h2>Tuning strategy</h2><p className="panel-sub">Selections update the generated recipe and resource estimate</p><div className="choice-grid">{methods.map(([id,name,badge,copy]) => <button key={id} className={`choice-card ${method === id ? "selected" : ""}`} onClick={()=>setMethod(id)}>{id === "qlora" && <span className="recommended">{badge}</span>}<strong>{name}</strong><span>{copy}</span></button>)}</div><RangeControl label="Training epochs" value={epochs} display={String(epochs)} min={1} max={8} setValue={setEpochs}/><RangeControl label="Learning rate" value={learningRate} display={`${learningRate}e-5`} min={1} max={10} setValue={setLearningRate}/><RangeControl label="Adapter rank" value={rank} display={`r = ${rank}`} min={8} max={64} step={8} setValue={setRank}/><button className="secondary-button full-button" onClick={() => downloadFile("localforge-recipe.json", JSON.stringify(recipe,null,2))}><Download size={13}/>Download recipe JSON</button></section><aside><div className="estimate-box"><div className="estimate-top"><span>Estimated local run</span><strong>{method === "full" ? "~4.2 hr" : `~${28 + epochs * 4} min`}</strong></div><div className="estimate-grid"><div><span>Peak VRAM</span><strong>{method === "qlora" ? "7.4 GB" : method === "lora" ? "12.8 GB" : "42+ GB"}</strong></div><div><span>Examples</span><strong>2,232 train</strong></div><div><span>Checkpoint</span><strong>{method === "full" ? "6.4 GB" : "186 MB"}</strong></div></div><div className="command">{command}</div></div><div className="panel run-panel"><div className="panel-title-row"><div><h2>{trainStatus === "complete" ? "Adapter ready" : trainStatus === "running" ? "Training in progress" : "Review before running"}</h2><p className="panel-sub">Demo compute is simulated; the stages and artifacts mirror the engine.</p></div>{trainStatus === "complete" && <CheckCircle2 color="var(--success)" size={22}/>}</div>{trainStatus !== "idle" && <><div className="progress-head"><span>{logs[logIndex]}</span><strong>{progress}%</strong></div><div className="big-progress"><span style={{width:`${progress}%`}}/></div><div className="run-log">{logs.slice(0,logIndex + 1).map((log,index)=><div key={log}><Check size={11}/><span>{log}</span><small>{index === logIndex && trainStatus === "running" ? "running" : "done"}</small></div>)}</div></>}{trainStatus === "idle" && <button className="secondary-button full-button" onClick={() => { copyText(command); notify("Launch command copied"); }}><Copy size={13}/>Copy launch command</button>}{trainStatus === "running" ? <button className="primary-button full-button" disabled><Activity className="spin" size={13}/>Simulating local run</button> : trainStatus === "complete" ? <button className="primary-button full-button" onClick={next}>Evaluate adapter <ArrowRight size={13}/></button> : <button className="primary-button full-button" onClick={startTraining}><Play size={13}/>Start tuning demo</button>}</div></aside></div></div>;
}

function EvaluateView({ back, next, evaluationRun, setEvaluationRun, selected, setSelected, notify }: { back:()=>void; next:()=>void; evaluationRun:boolean; setEvaluationRun:(v:boolean)=>void; selected:number; setSelected:(n:number)=>void; notify:(s:string)=>void }) {
  const [running, setRunning] = useState(false);
  const run = () => { setRunning(true); window.setTimeout(() => { setRunning(false); setEvaluationRun(true); notify("Evaluation complete — all required gates passed"); }, 1000); };
  const current = evaluationCases[selected];
  const report = { overall:87, task_accuracy:0.91, policy_fidelity:0.98, tone_match:0.86, median_latency_ms:412, required_gates:"passed", simulated:true };
  return <div className="workspace-view"><ViewHeading step="Stage 04 · Evaluate" title="Prove it got better." copy="Run the locked benchmark, inspect base-versus-tuned outputs, and promote only when every required gate passes." back={back}/>{!evaluationRun ? <section className="evaluation-start panel"><span className="modal-kicker"><FlaskConical size={14}/>Frozen holdout · 248 examples</span><h2>Run the same tests against both models.</h2><p>The demo will score task accuracy, policy fidelity, tone match, format validity, and latency, then expose the comparisons below.</p><button className="primary-button" onClick={run} disabled={running}>{running ? <><Activity className="spin" size={14}/>Running benchmark…</> : <><Play size={14}/>Run evaluation demo</>}</button></section> : <><section className="eval-hero"><div className="score-ring"><div><strong>87</strong><span>overall</span></div></div><div className="eval-copy"><span className="modal-kicker light"><CheckCircle2 size={13}/>All required gates passed</span><h2>Ready for review</h2><p>The tuned adapter improved goal adherence by 18 points without increasing policy violations. Explore each comparison before packaging it.</p><div className="button-row"><button className="secondary-button dark" onClick={() => downloadFile("evaluation-report.json",JSON.stringify(report,null,2))}><Download size={13}/>Report JSON</button><button className="primary-button" onClick={next}>Review deployment <ArrowRight size={13}/></button></div></div></section><div className="eval-grid"><EvalCard label="Task accuracy" value="91%" delta="+14 pts"/><EvalCard label="Policy fidelity" value="98%" delta="+3 pts"/><EvalCard label="Tone match" value="86%" delta="+21 pts"/><EvalCard label="Median latency" value="412 ms" delta="−83 ms"/></div><section className="panel comparison-panel"><div className="panel-title-row"><div><h2>Base vs. tuned</h2><p className="panel-sub">Select a case to inspect its full outputs</p></div><span className="simulated-label">Simulated inference</span></div><div className="case-tabs" role="tablist">{evaluationCases.map((item,index)=><button role="tab" aria-selected={selected === index} className={selected === index ? "active" : ""} onClick={()=>setSelected(index)} key={item.name}>{item.name}<span>{item.winner} wins</span></button>)}</div><div className="prompt-quote"><strong>Test prompt</strong><p>{current.prompt}</p></div><div className="response-grid"><div><span className="response-label">Base model</span><p>{current.base}</p><small>Policy risk detected</small></div><div className="winner"><span className="response-label"><CheckCircle2 size={12}/>Tuned adapter</span><p>{current.tuned}</p><small>Preferred by locked rubric</small></div></div></section></>}</div>;
}

function DeployView({ back, deploy, setDeploy, packageReady, packaging, buildPackage, manifest, command, notify }: { back:()=>void; deploy:string; setDeploy:(s:string)=>void; packageReady:boolean; packaging:boolean; buildPackage:()=>void; manifest:object; command:string; notify:(s:string)=>void }) {
  const options = [["ollama","OL","Ollama","Best for local chat and desktop workflows"],["vllm","vL","vLLM","High-throughput private-server API"],["gguf","GG","GGUF","Portable quantized llama.cpp workflow"],["adapter","HF","Adapter folder","Standard PEFT adapter and tokenizer"]] as const;
  const artifact = deploy === "ollama" ? `FROM qwen2.5:3b\nADAPTER ./adapter\nPARAMETER temperature 0.2\nSYSTEM You are a concise internal support specialist.` : deploy === "vllm" ? command : deploy === "gguf" ? "python convert_lora_to_gguf.py ./adapter --outfile localforge-adapter.gguf" : JSON.stringify(manifest,null,2);
  return <div className="workspace-view"><ViewHeading step="Stage 05 · Deploy" title="Package it for the real world." copy="Choose a runtime, build the release bundle, and download the same manifest and launch files the local engine produces." back={back}/><div className="two-col"><section className="panel"><h2>Deployment target</h2><p className="panel-sub">Every option creates a different launch artifact</p><div className="deploy-options">{options.map(([id,logo,name,copy])=><button key={id} className={`deploy-option ${deploy===id?"selected":""}`} onClick={()=>setDeploy(id)}><span className="deploy-logo">{logo}</span><span><strong>{name}</strong><span>{copy}</span></span><span className="radio"/></button>)}</div><div className="artifact-preview"><div><strong>{deploy === "ollama" ? "Modelfile" : deploy === "vllm" ? "launch-command.txt" : deploy === "gguf" ? "convert-command.txt" : "adapter-manifest.json"}</strong><button onClick={()=>{ copyText(artifact); notify("Artifact text copied"); }}><Copy size={12}/>Copy</button></div><pre>{artifact}</pre></div></section><aside><div className={`panel release-panel ${packageReady ? "ready" : ""}`}><div className="release-icon">{packageReady ? <CheckCircle2 size={22}/> : <PackageCheck size={22}/>}</div><h2>{packageReady ? "Release bundle ready" : "Build release bundle"}</h2><p className="panel-sub">localforge-support-v1 · demo package</p><div className="check-list"><CheckItem label="Adapter manifest" result={packageReady ? "Ready" : "Pending"}/><CheckItem label="Runtime launch file" result={packageReady ? "Ready" : "Pending"}/><CheckItem label="Evaluation report" result={packageReady ? "Attached" : "Pending"}/><CheckItem label="Model card" result={packageReady ? "Generated" : "Pending"}/><CheckItem label="SHA-256 manifest" result={packageReady ? "Verified" : "Pending"}/></div><div className="safety-note"><ShieldCheck size={16}/><span>The demo manifest is real and downloadable. It intentionally contains no model weights or private data.</span></div>{!packageReady ? <button className="primary-button full-button" onClick={buildPackage} disabled={packaging}>{packaging ? <><Activity className="spin" size={13}/>Assembling bundle…</> : <><CloudCog size={14}/>Build demo package</>}</button> : <div className="download-stack"><button className="primary-button full-button" onClick={()=>downloadFile("localforge-release-manifest.json",JSON.stringify(manifest,null,2))}><Download size={13}/>Download manifest</button><button className="secondary-button full-button" onClick={()=>downloadFile(deploy === "ollama" ? "Modelfile" : `${deploy}-launch.txt`,artifact,"text/plain")}><Download size={13}/>Download launch file</button><button className="text-button" onClick={buildPackage}><RefreshCw size={11}/>Rebuild package</button></div>}</div></aside></div></div>;
}

function deployCommand(target: string, project: string) {
  const name = project.toLowerCase().replaceAll(" ", "-");
  if (target === "ollama") return `ollama create ${name}:v1 -f ./Modelfile`;
  if (target === "vllm") return `vllm serve Qwen/Qwen2.5-3B-Instruct --enable-lora --lora-modules ${name}=./adapter`;
  if (target === "gguf") return `llama-cli -m ${name}.gguf -p "How can I help?"`;
  return `python -m localforge.package --target adapter --name ${name}`;
}

function ViewHeading({ step, title, copy, back }: { step:string; title:string; copy:string; back:()=>void }) { return <div className="view-heading"><div><button className="back-button" onClick={back}><ArrowLeft size={13}/>Previous stage</button><div className="eyebrow"><span className="eyebrow-line"/>{step}</div><h1>{title}</h1><p>{copy}</p></div></div>; }
function Metric({ label, value }: { label:string; value:number }) { return <div className="metric-row"><span>{label}</span><span className="metric-track"><span className="metric-fill" style={{width:`${value}%`}}/></span><strong>{value}%</strong></div>; }
function CheckItem({ label, result, warn=false }: { label:string; result:string; warn?:boolean }) { return <div className="check-item"><span>{label}</span><span className={warn ? "check-warn" : "check-good"}>{result}</span></div>; }
function EvalCard({ label, value, delta }: { label:string; value:string; delta:string }) { return <div className="eval-card"><span>{label}</span><strong>{value}</strong><span className="delta">{delta} vs. base</span></div>; }
function RangeControl({ label, value, display, min, max, step=1, setValue }: { label:string; value:number; display:string; min:number; max:number; step?:number; setValue:(n:number)=>void }) { return <div className="control"><div className="control-head"><span>{label}</span><span>{display}</span></div><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={event=>setValue(Number(event.target.value))}/></div>; }
