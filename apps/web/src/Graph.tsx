/**
 * Flow graph: orchestrator -> agents -> MCP gates, drawn from the gates/agents config (milestone-1 §4).
 * Edges animate while a tool call is in flight, red after an error. Editing: draw an edge from an agent to a gate to
 * let the agent read through it; select an edge or node and press Delete to remove it; drop a catalog item to add it.
 */
import { Background, Handle, Position, ReactFlow, type Connection, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { HubFile } from "@agenthub/core/hub-config";
import type { NodeStatus, View } from "./state.ts";

export const STATUS_LABEL: Record<NodeStatus, string> = {
  idle: "Chờ",
  running: "Đang chạy",
  done: "Xong",
  warning: "Có cảnh báo",
  "needs-action": "Cần bạn xử lý",
  failed: "Lỗi",
};
export const SERVER_LABEL: Record<string, string> = {
  workiq: "Work IQ",
  ado: "Azure DevOps MCP",
  github: "GitHub MCP",
  azure: "Azure MCP",
};

export type Selection = { kind: "orchestrator" } | { kind: "agent"; name: string } | { kind: "server"; name: string };
/** What a catalog item carries while dragged onto the graph. */
export const DRAG_TYPE = "application/x-agenthub-item";

type HubNodeData = { tag: string; title: string; subtitle: string; status: NodeStatus; meta: string; selected: boolean; off?: boolean; problem?: string };

function HubNode({ data }: NodeProps<Node<HubNodeData>>) {
  return (
    <div className={`node ${data.status}${data.selected ? " selected" : ""}${data.off ? " off" : ""}`} title={data.problem}>
      <Handle type="target" position={Position.Left} />
      <div className="node-head">
        <span className={`tag ${data.tag.toLowerCase()}`}>{data.tag}</span>
        <span className="node-title">{data.title}</span>
      </div>
      <div className="node-sub">{data.subtitle}</div>
      <div className="node-status">
        <span className={`dot ${data.status}`} aria-hidden />
        {data.off ? "Đang tắt" : data.problem ? "Thiếu cấu hình" : STATUS_LABEL[data.status]}
        {data.meta && <span className="node-meta">{data.meta}</span>}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { hub: HubNode };

const secs = (ms?: number) => (ms === undefined ? "" : `${(ms / 1000).toFixed(1)}s`);

export function Graph(props: {
  file: HubFile;
  /** Problems of enabled agents (missing settings), by name. */
  problems: Record<string, string | null>;
  /** Title and one-line description of each node, by node id (`agent:<name>`, `server:<key>`). */
  labels: Record<string, { title: string; sub: string }>;
  view: View;
  running: boolean;
  selection: Selection;
  onSelect: (s: Selection) => void;
  /** A new config after an edit on the graph. */
  onChange: (file: HubFile) => void;
  onDropItem: (data: string) => void;
}) {
  const { file, view, running, selection } = props;
  const isSel = (s: Selection) => JSON.stringify(s) === JSON.stringify(selection);
  const agents = Object.entries(file.agents);
  const gates = Object.entries(file.servers);
  const rowH = 120;
  const mid = (n: number) => ((Math.max(agents.length, gates.length) - n) * rowH) / 2;
  const orchStatus: NodeStatus = view.orchestratorError ? "failed" : running ? "running" : Object.values(view.agents).some((a) => a.status !== "idle") ? "done" : "idle";

  const nodes: Node<HubNodeData>[] = [
    {
      id: "orchestrator",
      type: "hub",
      position: { x: 0, y: mid(1) },
      deletable: false,
      data: { tag: "Hub", title: "Orchestrator", subtitle: `${agents.filter(([, e]) => e.enabled !== false).length} agent đọc song song`, status: orchStatus, meta: "", selected: isSel({ kind: "orchestrator" }) },
    },
  ];
  const edges: Edge[] = [];
  agents.forEach(([name, e], i) => {
    const av = view.agents[name];
    const off = e.enabled === false;
    const meta = av ? [av.calls.length ? `${av.calls.length} tool` : "", secs(av.durationMs), av.credits ? `${av.credits.toFixed(1)} cr` : ""].filter(Boolean).join(" · ") : "";
    nodes.push({
      id: `agent:${name}`,
      type: "hub",
      position: { x: 300, y: mid(agents.length) + i * rowH },
      data: { tag: "Agent", title: props.labels[`agent:${name}`]?.title ?? name, subtitle: props.labels[`agent:${name}`]?.sub ?? name, status: av?.status ?? "idle", meta, selected: isSel({ kind: "agent", name }), off, problem: props.problems[name] ?? undefined },
    });
    edges.push({ id: `o>${name}`, source: "orchestrator", target: `agent:${name}`, deletable: false, animated: av?.status === "running", className: av && (av.status === "failed" || av.status === "needs-action") ? "edge-error" : undefined });
    for (const s of e.servers) {
      const ev = view.edges[`${name}>${s}`];
      edges.push({ id: `${name}>${s}`, source: `agent:${name}`, target: `server:${s}`, animated: (ev?.active ?? 0) > 0, className: ev?.error ? "edge-error" : undefined });
    }
  });
  gates.forEach(([key, g], i) => {
    const sv = view.servers[key];
    nodes.push({
      id: `server:${key}`,
      type: "hub",
      position: { x: 620, y: mid(gates.length) + i * rowH },
      data: { tag: "MCP", title: props.labels[`server:${key}`]?.title ?? g.label ?? key, subtitle: props.labels[`server:${key}`]?.sub ?? `cổng ${key}`, status: sv?.status ?? "idle", meta: sv?.calls ? `${sv.calls} lần gọi` : "", selected: isSel({ kind: "server", name: key }) },
    });
  });

  const edit = (fn: (f: HubFile) => void) => {
    const next = structuredClone(file);
    fn(next);
    props.onChange(next);
  };
  const isLink = (c: Connection | Edge) => c.source.startsWith("agent:") && c.target.startsWith("server:");

  return (
    <div
      className="graph-drop"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault();
      }}
      onDrop={(e) => {
        const data = e.dataTransfer.getData(DRAG_TYPE);
        if (data) {
          e.preventDefault();
          props.onDropItem(data);
        }
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesDraggable={false}
        nodesConnectable={!running}
        deleteKeyCode={running ? null : ["Delete", "Backspace"]}
        isValidConnection={isLink}
        onConnect={(c) =>
          edit((f) => {
            const name = c.source.slice("agent:".length);
            const key = c.target.slice("server:".length);
            if (!f.agents[name].servers.includes(key)) f.agents[name].servers.push(key);
          })
        }
        onDelete={({ nodes: ns, edges: es }) => {
          const gone = ns.map((n) => n.id).filter((id) => id !== "orchestrator");
          const links = es.filter(isLink);
          if (!gone.length && !links.length) return;
          const what = [...gone.map((id) => id.replace("agent:", "agent ").replace("server:", "cổng ")), ...links.map((l) => `dây ${l.id.replace(">", " → ")}`)];
          if (!confirm(`Xoá ${what.join(", ")}?`)) return;
          edit((f) => {
            for (const id of gone) {
              if (id.startsWith("agent:")) delete f.agents[id.slice(6)];
              if (id.startsWith("server:")) {
                const key = id.slice(7);
                delete f.servers[key];
                for (const a of Object.values(f.agents)) a.servers = a.servers.filter((s) => s !== key);
              }
            }
            for (const l of links) {
              const a = f.agents[l.source.slice(6)];
              if (a) a.servers = a.servers.filter((s) => s !== l.target.slice(7));
            }
          });
        }}
        onNodeClick={(_, n) => {
          const [kind, name] = n.id.split(":");
          props.onSelect(kind === "orchestrator" ? { kind } : ({ kind, name } as Selection));
        }}
      >
        <Background gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
