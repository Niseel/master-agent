/** Flow graph: orchestrator -> agents -> MCP servers. Edges animate while a tool call is in flight, red after an error. */
import { Background, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AgentInfo, NodeStatus, View } from "./state.ts";

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

type HubNodeData = { title: string; subtitle: string; status: NodeStatus; meta: string; selected: boolean };

function HubNode({ data }: NodeProps<Node<HubNodeData>>) {
  return (
    <div className={`node ${data.status}${data.selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-title">{data.title}</div>
      <div className="node-sub">{data.subtitle}</div>
      <div className="node-status">
        <span className={`dot ${data.status}`} aria-hidden />
        {STATUS_LABEL[data.status]}
        {data.meta && <span className="node-meta">{data.meta}</span>}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { hub: HubNode };

const secs = (ms?: number) => (ms === undefined ? "" : `${(ms / 1000).toFixed(1)}s`);

export function Graph(props: {
  agents: AgentInfo[];
  view: View;
  running: boolean;
  selection: Selection;
  onSelect: (s: Selection) => void;
}) {
  const { agents, view, running, selection } = props;
  const isSel = (s: Selection) => JSON.stringify(s) === JSON.stringify(selection);
  const rowH = 120;
  const top = ((agents.length - 1) * rowH) / 2;
  const orchStatus: NodeStatus = view.orchestratorError ? "failed" : running ? "running" : Object.values(view.agents).some((a) => a.status !== "idle") ? "done" : "idle";

  const nodes: Node<HubNodeData>[] = [
    {
      id: "orchestrator",
      type: "hub",
      position: { x: 0, y: top },
      data: { title: "Orchestrator", subtitle: `${agents.length} agent đọc song song`, status: orchStatus, meta: "", selected: isSel({ kind: "orchestrator" }) },
    },
  ];
  const edges: Edge[] = [];
  const seen = new Set<string>();
  agents.forEach((a, i) => {
    const av = view.agents[a.name];
    const meta = [av.calls.length ? `${av.calls.length} tool` : "", secs(av.durationMs), av.credits ? `${av.credits.toFixed(1)} cr` : ""].filter(Boolean).join(" · ");
    nodes.push({
      id: `agent:${a.name}`,
      type: "hub",
      position: { x: 300, y: i * rowH },
      data: { title: a.displayName, subtitle: a.name, status: av.status, meta, selected: isSel({ kind: "agent", name: a.name }) },
    });
    edges.push({
      id: `o>${a.name}`,
      source: "orchestrator",
      target: `agent:${a.name}`,
      animated: av.status === "running",
      className: av.status === "failed" || av.status === "needs-action" ? "edge-error" : undefined,
    });
    for (const s of a.servers) {
      const sv = view.servers[s];
      if (!seen.has(s)) {
        seen.add(s);
        nodes.push({
          id: `server:${s}`,
          type: "hub",
          position: { x: 620, y: i * rowH },
          data: { title: SERVER_LABEL[s] ?? s, subtitle: `MCP · ${s}`, status: sv.status, meta: sv.calls ? `${sv.calls} lần gọi` : "", selected: isSel({ kind: "server", name: s }) },
        });
      }
      const e = view.edges[`${a.name}>${s}`];
      edges.push({ id: `${a.name}>${s}`, source: `agent:${a.name}`, target: `server:${s}`, animated: e.active > 0, className: e.error ? "edge-error" : undefined });
    }
  });

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      nodesDraggable={false}
      nodesConnectable={false}
      onNodeClick={(_, n) => {
        const [kind, name] = n.id.split(":");
        props.onSelect(kind === "orchestrator" ? { kind } : ({ kind, name } as Selection));
      }}
    >
      <Background gap={20} size={1} />
    </ReactFlow>
  );
}
