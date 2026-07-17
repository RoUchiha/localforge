"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowLeft, ArrowRight, Beaker, Bell, Box, BrainCircuit, Check,
  ChevronDown, CircleGauge, ClipboardCheck, CloudCog, Code2, Cpu, Database,
  FileJson, FlaskConical, HardDrive, Menu, MessageSquareText, PackageCheck,
  Play, Rocket, ShieldCheck, SlidersHorizontal, Sparkles, Upload, WandSparkles,
} from "lucide-react";

type View = "define" | "data" | "tune" | "evaluate" | "deploy";
type DisplayPlan = ReturnType<typeof inferPlan>;

const nav = [
  { id: "define" as View, label: "Define", icon: MessageSquareText },
  { id: "data" as View, label: "Data", icon: Database },
  { id: "tune" as View, label: "Tune", icon: SlidersHorizontal },
  { id: "evaluate" as View, label: "Evaluate", icon: FlaskConical },
  { id: "deploy" as View, label: "Deploy", icon: Rocket },
];

const samples = {
  Support: "Build a warm, concise support assistant for our internal IT team. It should follow our runbooks, ask one clarifying question when needed, never invent policy, and run on a 12 GB GPU.",
  Extraction: "Tune a small model to extract vendor names, renewal dates, values, and risk clauses from private contracts as strict JSON. Favor precision and CPU-friendly deployment.",
  Voice: "Create an offline writing assistant that rewrites technical updates in our calm, direct brand voice. Preserve facts exactly and keep answers under 120 words.",
};

function inferPlan(prompt: string) {
  const lower = prompt.toLowerCase();
  const extraction = /extract|json|fields|structured/.test(lower);
  const constrained = /cpu|8 gb|12 gb|small|laptop|edge/.test(lower);
  const safety = /never|policy|private|preserve|exact/.test(lower);
  return {
    task: extraction ? "Structured extraction" : /rewrite|voice|writing/.test(lower) ? "Style adaptation" : "Instruction following",
    base: constrained ? "Qwen 2.5 · 3B Instruct" : "Llama 3.1 · 8B Instruct",
    method: "QLoRA · 4-bit",
    format: extraction ? "JSONL · prompt / schema / answer" : "JSONL · system / user / assistant",
    target: constrained ? "≤ 7.4 GB VRAM" : "≤ 11.8 GB VRAM",
    objective: safety ? "Accuracy + refusal fidelity" : "Task accuracy + style match",
  };
}

export function Studio() {
  const [view, setView] = useState<View>("define");
  const [prompt, setPrompt] = useState(samples.Support);
  const [planReady, setPlanReady] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [method, setMethod] = useState("qlora");
  const [epochs, setEpochs] = useState(3);
  const [deploy, setDeploy] = useState("ollama");
  const [enginePlan, setEnginePlan] = useState<DisplayPlan | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const plan = useMemo(() => enginePlan ?? inferPlan(prompt), [enginePlan, prompt]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1500);
    fetch("http://127.0.0.1:8844/health", { signal: controller.signal })
      .then(response => { if (response.ok) setEngineReady(true); })
      .catch(() => setEngineReady(false))
      .finally(() => window.clearTimeout(timer));
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, []);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const generatePlan = async () => {
    if (!prompt.trim()) return;
    setPlanning(true);
    try {
      const response = await fetch("http://127.0.0.1:8844/v1/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: prompt, hardware: { gpu_vram_gb: 12 } }),
      });
      if (!response.ok) throw new Error("engine unavailable");
      const result = await response.json();
      setEnginePlan({
        task: String(result.task_type).replaceAll("_", " "),
        base: String(result.base_model).replace("/", " · "),
        method: `${String(result.recipe.method).toUpperCase()} · ${result.recipe.quantization_bits ?? 16}-bit`,
        format: result.data_format,
        target: result.recipe.method === "qlora" ? "Local GPU optimized" : "Local runtime",
        objective: (result.evaluation_gates ?? []).slice(0, 2).map((gate: {metric:string}) => gate.metric.replaceAll("_", " ")).join(" + "),
      });
      setEngineReady(true);
      notify("Plan created by your local engine");
    } catch {
      setEnginePlan(inferPlan(prompt));
      notify("Preview plan ready — start the local engine to use your own model");
    } finally {
      setPlanning(false);
      setPlanReady(true);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Project navigation">
        <div className="brand"><div className="brand-mark">LF</div><div className="brand-copy"><strong>LocalForge</strong><span>Private model studio</span></div></div>
        <button className="workspace-switcher" aria-label="Switch project"><span className="workspace-name"><Box size={15}/><span>Support specialist</span></span><ChevronDown size={14}/></button>
        <div className="nav-label">Build flow</div>
        <nav className="nav-list">
          {nav.map(({ id, label, icon: Icon }, index) => (
            <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => setView(id)}><Icon size={16}/><span>{label}</span><span className="step-number">0{index + 1}</span></button>
          ))}
        </nav>
        <div className="sidebar-bottom"><div className="local-card"><div className="local-status"><span className={`status-dot ${engineReady ? "" : "offline"}`}/>{engineReady ? "Local engine ready" : "Preview mode"}</div><div className="local-meta">{engineReady ? <>Loopback API connected<br/>Private runtime active</> : <>Start localforge serve<br/>to run private jobs</>}</div></div></div>
      </aside>
      <main className="main">
        <header className="topbar"><div className="crumbs"><button className="icon-button mobile-menu" aria-label="Open menu"><Menu size={16}/></button><span>Projects</span><span>/</span><strong>Support specialist</strong></div><div className="top-actions"><button className="icon-button" aria-label="Notifications"><Bell size={15}/></button><div className="avatar" aria-label="User profile">RS</div></div></header>
        <div className="content">
          {view === "define" && <DefineView prompt={prompt} setPrompt={setPrompt} planReady={planReady} planning={planning} generatePlan={generatePlan} plan={plan} openView={setView}/>}
          {view === "data" && <DataView back={() => setView("define")} next={() => setView("tune")} notify={notify}/>}
          {view === "tune" && <TuneView back={() => setView("data")} next={() => setView("evaluate")} method={method} setMethod={setMethod} epochs={epochs} setEpochs={setEpochs} notify={notify}/>}
          {view === "evaluate" && <EvaluateView back={() => setView("tune")} next={() => setView("deploy")}/>}
          {view === "deploy" && <DeployView back={() => setView("evaluate")} deploy={deploy} setDeploy={setDeploy} notify={notify}/>}
        </div>
      </main>
      {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
    </div>
  );
}

function DefineView({ prompt, setPrompt, planReady, planning, generatePlan, plan, openView }: {
  prompt: string; setPrompt: (v: string) => void; planReady: boolean; planning: boolean; generatePlan: () => void;
  plan: DisplayPlan; openView: (v: View) => void;
}) {
  const cards = [
    ["data", Database, "Prepare data", "Import JSONL or CSV, then catch leaks and malformed examples."],
    ["tune", Beaker, "Tune locally", "Run a generated LoRA or QLoRA recipe on your own hardware."],
    ["evaluate", ClipboardCheck, "Compare honestly", "Test the base and tuned model against the same locked rubric."],
    ["deploy", PackageCheck, "Ship anywhere", "Package for Ollama, vLLM, llama.cpp, or Hugging Face."],
  ] as const;
  return <div className="workspace-view">
    <div className="eyebrow"><span className="eyebrow-line"/>Natural-language model building</div>
    <h1>Shape a model around your work.</h1>
    <p className="lede">Describe the behavior you want in plain language. LocalForge turns it into a transparent recipe you can inspect, edit, test, and run entirely on your machine.</p>
    <div className="hero-grid">
      <section className="prompt-card"><div className="card-kicker"><span>What should your model become?</span><span className="private-pill"><ShieldCheck size={12}/>Stays on device</span></div><div className="prompt-box"><textarea value={prompt} onChange={e => setPrompt(e.target.value)} aria-label="Describe the model you want" placeholder="Example: I need a small, private assistant that..."/><div className="prompt-footer"><div className="prompt-hint"><Sparkles size={12}/>Mention tone, constraints, examples, and hardware</div><button className="primary-button" onClick={generatePlan} disabled={planning || !prompt.trim()}>{planning ? <><Activity size={14}/>Building plan…</> : <><WandSparkles size={14}/>{planReady ? "Rebuild plan" : "Build my plan"}</>}</button></div></div><div className="sample-row"><span className="sample-label">Try a goal</span>{Object.entries(samples).map(([label, text]) => <button className="sample-chip" key={label} onClick={() => setPrompt(text)}>{label}</button>)}</div></section>
      <aside className="context-card"><ShieldCheck size={20} color="var(--accent)"/><h2>Local means local.</h2><p>Your prompts, datasets, checkpoints, and evaluation examples never need to leave your network.</p><div className="privacy-list"><div className="privacy-item"><span><HardDrive size={12}/></span>Files stay in your workspace</div><div className="privacy-item"><span><Cpu size={12}/></span>Training runs on your hardware</div><div className="privacy-item"><span><Code2 size={12}/></span>Every generated command is visible</div></div></aside>
    </div>
    {planReady && <PlanPanel plan={plan} onContinue={() => openView("data")}/>}
    <div className="section-head"><div><h2>One guided path, no black boxes</h2><p>Each stage produces a versioned artifact you can keep or change.</p></div><button className="text-button" onClick={() => openView("data")}>Open full workflow →</button></div>
    <div className="workflow-grid">{cards.map(([id, Icon, title, copy], index) => <button className={`workflow-card ${planReady ? "ready" : ""}`} key={id} onClick={() => openView(id)}><div className="workflow-icon"><Icon size={15}/></div><h3>{title}</h3><p>{copy}</p><div className="workflow-status">{planReady && index === 0 ? "Ready to review" : `Stage 0${index + 1}`}</div></button>)}</div>
  </div>;
}

function PlanPanel({ plan, onContinue }: { plan: DisplayPlan; onContinue: () => void }) {
  return <section className="panel plan-panel"><div className="plan-header"><div className="plan-title"><span className="plan-title-badge"><BrainCircuit size={16}/></span><div><strong>Your first tuning plan</strong><span>Generated locally · editable before anything runs</span></div></div><button className="primary-button" onClick={onContinue}>Review data <ArrowRight size={13}/></button></div><div className="plan-body"><div className="plan-column"><div className="plan-label">Recommended recipe</div><div className="plan-facts">{["Task", "Base model", "Method", "Data format", "Hardware target", "Optimization goal"].map((label, i) => <div className="fact" key={label}><span>{label}</span><strong>{Object.values(plan)[i]}</strong></div>)}</div></div><div className="plan-column"><div className="plan-label">Why this plan</div><p className="reasoning">A parameter-efficient adapter keeps the job small enough for local hardware while preserving the base model. The evaluation gate prioritizes your stated constraints before style.</p><div className="metric-list"><Metric label="Goal fit" value={94}/><Metric label="Hardware fit" value={88}/><Metric label="Data readiness" value={72}/></div></div></div></section>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="metric-row"><span>{label}</span><span className="metric-track"><span className="metric-fill" style={{width: `${value}%`}}/></span><strong>{value}%</strong></div>; }
function ViewHeading({ step, title, copy, back }: { step: string; title: string; copy: string; back: () => void }) { return <div className="view-heading"><div><button className="back-button" onClick={back}><ArrowLeft size={13}/>Previous stage</button><div className="eyebrow"><span className="eyebrow-line"/>{step}</div><h1>{title}</h1><p>{copy}</p></div></div>; }

function DataView({ back, next, notify }: { back: () => void; next: () => void; notify: (s: string) => void }) {
  const [report, setReport] = useState<{rows:number; valid_rows:number; duplicate_rows:number; possible_secret_rows:number; health_score:number} | null>(null);
  const inspectFile = async (file?: File) => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch("http://127.0.0.1:8844/v1/datasets/inspect", { method: "POST", body: form });
      if (!response.ok) throw new Error("inspection failed");
      setReport(await response.json());
      notify("Dataset inspected by your local engine");
    } catch {
      notify("Start localforge serve to inspect your private dataset");
    }
  };
  const rows = report?.rows ?? 2480;
  return <div className="workspace-view"><ViewHeading step="Stage 02 · Data" title="Teach with examples, not guesswork." copy="Bring your own examples or let LocalForge create a review queue from source material. Nothing is uploaded." back={back}/><div className="two-col"><section className="panel"><h2>Training examples</h2><p className="panel-sub">JSONL or CSV · up to the limit of your local disk</p><div className="dropzone"><div className="drop-icon"><Upload size={17}/></div><strong>Choose a dataset to inspect</strong><span>The local engine scans it without sending it to a hosted service</span><label className="secondary-button"><FileJson size={13}/>Choose local file<input className="file-input" type="file" accept=".jsonl,.csv" onChange={event => inspectFile(event.target.files?.[0])}/></label></div><div className="section-head"><div><h2>Preview</h2><p>3 of {rows.toLocaleString()} examples</p></div></div><table className="data-table"><thead><tr><th>#</th><th>User message</th><th>Ideal response</th></tr></thead><tbody><tr><td>001</td><td><span className="truncate">My VPN says the certificate has expired…</span></td><td><span className="truncate">I can help. First, confirm whether…</span></td></tr><tr><td>002</td><td><span className="truncate">Can I install an unapproved browser?</span></td><td><span className="truncate">The approved software policy requires…</span></td></tr><tr><td>003</td><td><span className="truncate">Reset my admin password immediately.</span></td><td><span className="truncate">For security, I can’t reset it here…</span></td></tr></tbody></table></section><aside className="panel"><h2>Quality scan</h2><p className="panel-sub">{report ? "Live local report" : "Illustrative preview — choose a file for live results"}</p><div className="quality-score"><div><span>Dataset health</span><strong>{report?.health_score ?? 91}</strong></div><CircleGauge size={28}/></div><div className="check-list"><CheckItem label="Required fields" result={`${(report?.valid_rows ?? 2480).toLocaleString()} / ${rows.toLocaleString()}`}/><CheckItem label="Near duplicates" result={`${report?.duplicate_rows ?? 12} flagged`} warn={(report?.duplicate_rows ?? 12) > 0}/><CheckItem label="Possible secrets" result={`${report?.possible_secret_rows ?? 0} found`} warn={(report?.possible_secret_rows ?? 0) > 0}/><CheckItem label="Train / test leakage" result={report ? "Run with holdout set" : "0.8% flagged"} warn/><CheckItem label="Response length outliers" result={report ? "Checked during tokenize" : "7 flagged"} warn/></div><button className="primary-button" style={{width:"100%", marginTop:18}} onClick={next}>Approve & configure tuning <ArrowRight size={13}/></button></aside></div></div>;
}

function CheckItem({ label, result, warn=false }: { label: string; result: string; warn?: boolean }) { return <div className="check-item"><span>{label}</span><span className={warn ? "check-warn" : "check-good"}>{result}</span></div>; }

function TuneView({ back, next, method, setMethod, epochs, setEpochs, notify }: { back: () => void; next: () => void; method: string; setMethod: (s:string)=>void; epochs:number; setEpochs:(n:number)=>void; notify:(s:string)=>void }) {
  const methods = [["qlora","QLoRA","Best local fit","4-bit base weights with trainable adapters."],["lora","LoRA","Higher fidelity","More memory, simpler merge and export."],["full","Full tune","Advanced","Maximum control for multi-GPU systems."]] as const;
  return <div className="workspace-view"><ViewHeading step="Stage 03 · Tune" title="Control the trade-offs." copy="Start with a safe recommendation, then adjust the recipe. LocalForge explains what every setting changes." back={back}/><div className="two-col"><section className="panel"><h2>Tuning strategy</h2><p className="panel-sub">Recommended from your goal, data size, and detected hardware</p><div className="choice-grid">{methods.map(([id,name,,copy]) => <button key={id} className={`choice-card ${method === id ? "selected" : ""}`} onClick={()=>setMethod(id)}>{id === "qlora" && <span className="recommended">Recommended</span>}<strong>{name}</strong><span>{copy}</span></button>)}</div><div className="control"><div className="control-head"><span>Training epochs</span><span>{epochs}</span></div><input aria-label="Training epochs" type="range" min="1" max="8" value={epochs} onChange={e=>setEpochs(Number(e.target.value))}/></div><div className="control"><div className="control-head"><span>Learning rate</span><span>2e-4</span></div><input aria-label="Learning rate" type="range" min="1" max="10" defaultValue="4"/></div><div className="control"><div className="control-head"><span>Adapter rank</span><span>r = 16</span></div><input aria-label="Adapter rank" type="range" min="1" max="4" defaultValue="2"/></div></section><aside><div className="estimate-box"><div className="estimate-top"><span>Estimated local run</span><strong>~38 min</strong></div><div className="estimate-grid"><div><span>Peak VRAM</span><strong>7.4 GB</strong></div><div><span>Examples</span><strong>2,232 train</strong></div><div><span>Checkpoint</span><strong>186 MB</strong></div></div><div className="command">localforge run support-specialist<br/>--recipe qlora --epochs {epochs}<br/>--device auto --confirm</div></div><div className="panel" style={{marginTop:14}}><h2>Nothing runs silently</h2><p className="panel-sub">The exact recipe, command, paths, and estimated resources are shown before a process starts.</p><button className="secondary-button" style={{width:"100%"}} onClick={()=>notify("Recipe copied to clipboard preview")}><Code2 size={13}/>Copy generated recipe</button><button className="primary-button" style={{width:"100%", marginTop:10}} onClick={next}><Play size={13}/>Start local tuning</button></div></aside></div></div>;
}

function EvaluateView({ back, next }: { back: () => void; next: () => void }) {
  return <div className="workspace-view"><ViewHeading step="Stage 04 · Evaluate" title="Prove it got better." copy="Compare the base and tuned model on a frozen holdout set. Promote only when the model clears every required gate." back={back}/><section className="eval-hero"><div className="score-ring"><div><strong>87</strong><span>overall</span></div></div><div className="eval-copy"><h2>Ready for review</h2><p>The tuned adapter improved goal adherence by 18 points without increasing policy violations. Two edge cases still need a human decision.</p><button className="primary-button" onClick={next}>Review deployment <ArrowRight size={13}/></button></div></section><div className="eval-grid"><EvalCard label="Task accuracy" value="91%" delta="+14 pts"/><EvalCard label="Policy fidelity" value="98%" delta="+3 pts"/><EvalCard label="Tone match" value="86%" delta="+21 pts"/><EvalCard label="Median latency" value="412 ms" delta="−83 ms"/></div><div className="two-col" style={{marginTop:14}}><section className="panel"><h2>Base vs. tuned</h2><p className="panel-sub">Same prompt, same decoding settings, blinded judge order</p><div className="check-list"><CheckItem label="VPN troubleshooting" result="Tuned wins"/><CheckItem label="Unapproved software policy" result="Tuned wins"/><CheckItem label="Ambiguous password reset" result="Needs review" warn/><CheckItem label="Unsupported request refusal" result="Tie"/></div></section><aside className="panel"><h2>Promotion gates</h2><p className="panel-sub">Deployment is blocked if a required threshold fails</p><div className="check-list"><CheckItem label="Accuracy ≥ 85%" result="91%"/><CheckItem label="Policy fidelity ≥ 97%" result="98%"/><CheckItem label="PII leakage = 0" result="0"/><CheckItem label="Human review queue" result="2 cases" warn/></div></aside></div></div>;
}

function EvalCard({ label, value, delta }: { label:string; value:string; delta:string }) { return <div className="eval-card"><span>{label}</span><strong>{value}</strong><span className="delta">{delta} vs. base</span></div>; }

function DeployView({ back, deploy, setDeploy, notify }: { back:()=>void; deploy:string; setDeploy:(s:string)=>void; notify:(s:string)=>void }) {
  const options = [["ollama","OL","Ollama","Best for local chat and desktop workflows"],["vllm","vL","vLLM","High-throughput local or private-server API"],["gguf","GG","GGUF","Portable quantized file for llama.cpp tools"],["hf","HF","Model folder","Standard adapter + tokenizer artifact"]] as const;
  return <div className="workspace-view"><ViewHeading step="Stage 05 · Deploy" title="Package it for the real world." copy="Create a reproducible local artifact with the model card, evaluation report, hashes, and exact launch command." back={back}/><div className="two-col"><section className="panel"><h2>Deployment target</h2><p className="panel-sub">The base model is never uploaded by LocalForge</p><div className="deploy-options">{options.map(([id,logo,name,copy])=><button key={id} className={`deploy-option ${deploy===id?"selected":""}`} onClick={()=>setDeploy(id)}><span className="deploy-logo">{logo}</span><span><strong>{name}</strong><span>{copy}</span></span><span className="radio"/></button>)}</div></section><aside><div className="panel"><h2>Release bundle</h2><p className="panel-sub">localforge-support-v1 · 192 MB</p><div className="check-list"><CheckItem label="Adapter weights" result="Ready"/><CheckItem label="Tokenizer + template" result="Ready"/><CheckItem label="Evaluation report" result="Signed"/><CheckItem label="Model card" result="Generated"/><CheckItem label="SHA-256 manifest" result="Verified"/></div><div className="safety-note"><ShieldCheck size={16}/><span>LocalForge binds this bundle to the evaluated checkpoint so an untested model cannot be promoted by mistake.</span></div><button className="primary-button" style={{width:"100%", marginTop:13}} onClick={()=>notify(`${deploy.toUpperCase()} package created locally`)}><CloudCog size={14}/>Build local package</button></div><div className="command">ollama create support-specialist:v1 -f ./release/Modelfile<br/>ollama run support-specialist:v1</div></aside></div></div>;
}
