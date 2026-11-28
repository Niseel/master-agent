/**
 * Gates and agents on the dashboard (milestone-1 §4): the catalog to drag from, and the form of the selected node.
 * Every field says what it is, what to fill, where to find it and why it is needed.
 */
import { useEffect, useState } from "react";
import type { Field, Gate, HubFile } from "@agenthub/core/hub-config";
import type { ToolInfo } from "@agenthub/core/tool-list";
import * as api from "./api.ts";
import { DRAG_TYPE } from "./Graph.tsx";
import type { CatalogItem, ConfigView } from "./state.ts";

function Help({ f }: { f: Pick<Field, "what" | "fill" | "where" | "why" | "link"> }) {
  return (
    <dl className="help">
      <dt>Là gì</dt>
      <dd>{f.what}</dd>
      <dt>Điền gì</dt>
      <dd>{f.fill}</dd>
      <dt>Lấy ở đâu</dt>
      <dd>
        {f.where}{" "}
        {f.link && (
          <a href={f.link} target="_blank" rel="noopener noreferrer">
            Mở ↗
          </a>
        )}
      </dd>
      <dt>Để làm gì</dt>
      <dd>{f.why}</dd>
    </dl>
  );
}

/** Drag onto the graph, or press Thêm. */
export function Catalog({ config, onAdd, onClose }: { config: ConfigView; onAdd: (item: CatalogItem) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const item = (it: CatalogItem, title: string, sub: string, tag: string) => (
    <li key={JSON.stringify(it)} draggable onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(it))} className="cat-item">
      <div>
        <span className={`tag ${tag.toLowerCase()}`}>{tag}</span> <b>{title}</b>
        <div className="muted">{sub}</div>
      </div>
      <button onClick={() => onAdd(it)}>Thêm</button>
    </li>
  );
  const doImport = async (body: string) => {
    setMsg(null);
    try {
      const r = await api.importMcp(body);
      setMsg(
        `Đã thêm ${r.added.length} cổng vào catalog${r.secrets.length ? `; ${r.secrets.length} giá trị bí mật không được chép, nhập lại ở form của cổng` : ""}` +
          `${r.skipped.length ? `; bỏ qua: ${r.skipped.join("; ")}` : ""}.`,
      );
      setText("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <aside className="catalog" aria-label="Catalog cổng và agent">
      <div className="row">
        <b>Thêm cổng hoặc agent</b>
        <button onClick={onClose}>Đóng</button>
      </div>
      <p className="muted">Kéo vào sơ đồ hoặc bấm Thêm. Rồi kéo dây từ agent sang cổng để agent đọc qua cổng đó.</p>
      <h4>Cổng có sẵn</h4>
      <ul>{config.gateKinds.map((k) => item({ kind: "gate", preset: k.preset }, k.label, k.description, "MCP"))}</ul>
      {Object.keys(config.file.catalog).length > 0 && (
        <>
          <h4>Cổng từ mcp.json</h4>
          <ul>{Object.entries(config.file.catalog).map(([key, g]) => item({ kind: "gate", catalog: key }, g.label ?? key, g.type === "http" ? (g.url ?? "") : `${g.command ?? ""} ${(g.args ?? []).join(" ")}`, "MCP"))}</ul>
        </>
      )}
      <h4>Agent có sẵn</h4>
      <ul>{config.agentKinds.map((k) => item({ kind: "agent", preset: k.preset }, k.displayName, k.description, "Agent"))}</ul>
      <h4>Tự tạo</h4>
      <ul>
        {item({ kind: "gate", custom: "stdio" }, "Cổng chạy bằng lệnh (stdio)", "MCP server chạy trên máy này, ví dụ npx -y <gói>", "MCP")}
        {item({ kind: "gate", custom: "http" }, "Cổng qua URL (http)", "MCP server từ xa, ví dụ https://…/mcp", "MCP")}
        {item({ kind: "agent", custom: true }, "Agent tự viết", "Bạn mô tả việc cần đọc và quy tắc việc cần làm", "Agent")}
      </ul>
      <h4>Import từ mcp.json của VS Code</h4>
      <p className="muted">
        File ở .vscode/mcp.json của project, hoặc mở VS Code → Command Palette → "MCP: Open User Configuration". Token trong file không được chép; bạn nhập lại vào kho bí mật của máy.
      </p>
      <input
        type="file"
        accept=".json,application/json"
        aria-label="Chọn file mcp.json"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await doImport(await f.text());
          e.target.value = "";
        }}
      />
      <textarea rows={4} placeholder="…hoặc dán nội dung mcp.json vào đây" value={text} onChange={(e) => setText(e.target.value)} />
      <button disabled={!text.trim()} onClick={() => doImport(text)}>
        Import
      </button>
      {msg && <p className="hint">{msg}</p>}
    </aside>
  );
}

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const pairs = (s: string, sep: string) =>
  Object.fromEntries(lines(s).flatMap((l) => (l.includes(sep) ? [[l.slice(0, l.indexOf(sep)).trim(), l.slice(l.indexOf(sep) + 1).trim()]] : [])));
const unpair = (r: Record<string, string> | undefined, sep: string) => Object.entries(r ?? {}).map(([k, v]) => `${k}${sep} ${v}`).join("\n");
const inputsIn = (g: Gate) => [...JSON.stringify(g).matchAll(/\$\{input:([A-Za-z0-9_.-]+)\}/g)].map((m) => m[1]);

export function GateForm({ name, config, runtime, onSave }: { name: string; config: ConfigView; runtime: string; onSave: (file: HubFile) => void }) {
  const gate = config.file.servers[name];
  const kind = config.gateKinds.find((k) => k.preset === gate?.preset);
  const [draft, setDraft] = useState<Gate>(gate);
  const [values, setValues] = useState(config.file.values);
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [secret, setSecret] = useState<Record<string, string>>({});
  useEffect(() => {
    setDraft(gate);
    setValues(config.file.values);
    setTools(null);
    setErr(null);
  }, [name, gate, config.file.values]);
  if (!gate) return null;
  const ticked = new Set(draft.tools ?? kind?.tools ?? []);
  const save = () => onSave({ ...config.file, values, servers: { ...config.file.servers, [name]: draft } });
  const fetchTools = async () => {
    setBusy(true);
    setErr(null);
    try {
      setTools(await api.listTools(name));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const secrets = inputsIn(draft).filter((id) => config.file.inputs.some((i) => i.id === id && i.password));
  return (
    <div className="detail form">
      <div className="row">
        <h3>
          <span className="tag mcp">MCP</span> {draft.label ?? kind?.label ?? name}
        </h3>
        <code>{name}</code>
      </div>
      {kind && <p className="muted">{kind.description}</p>}
      <label>
        Tên hiển thị
        <input value={draft.label ?? ""} placeholder={kind?.label ?? name} maxLength={80} onChange={(e) => setDraft({ ...draft, label: e.target.value || undefined })} />
      </label>
      <label>
        Mô tả ngắn
        <input value={draft.description ?? ""} placeholder={kind?.description} maxLength={300} onChange={(e) => setDraft({ ...draft, description: e.target.value || undefined })} />
      </label>
      {kind?.fields.map((f) => (
        <label key={f.key}>
          {f.label}
          <input value={values[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
          <Help f={f} />
        </label>
      ))}
      {kind?.signIn === "microsoft" && (
        <label>
          Hồ sơ đăng nhập riêng (tuỳ chọn)
          <input value={draft.account ?? ""} placeholder="để trống = tài khoản az mặc định" onChange={(e) => setDraft({ ...draft, account: e.target.value || undefined })} />
          <Help
            f={{
              what: "Thư mục lưu phiên đăng nhập Microsoft riêng cho cổng này.",
              fill: "Đường dẫn tuyệt đối, ví dụ C:\\Users\\<bạn>\\.azure-ado. Để trống nếu cổng dùng cùng tài khoản với máy.",
              where: "Tự đặt; nút Đăng nhập ở tab Đăng nhập sẽ đăng nhập vào thư mục này.",
              why: "Khi Azure DevOps và Azure dùng hai tài khoản khác nhau, mỗi cổng giữ phiên của mình.",
            }}
          />
        </label>
      )}
      {!kind && (
        <>
          <label>
            Kiểu kết nối
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as "stdio" | "http" })}>
              <option value="stdio">Chạy lệnh trên máy này (stdio)</option>
              <option value="http">Qua URL (http)</option>
            </select>
          </label>
          {draft.type === "http" ? (
            <>
              <label>
                URL
                <input value={draft.url ?? ""} placeholder="https://example.com/mcp" onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
                <Help f={{ what: "Địa chỉ MCP server.", fill: "URL đầy đủ, bắt đầu bằng https://.", where: "Tài liệu của dịch vụ, hoặc mục \"url\" trong mcp.json của VS Code.", why: "Hub kết nối tới server này để lấy tool." }} />
              </label>
              <label>
                Header (mỗi dòng Tên: giá trị)
                <textarea rows={3} value={unpair(draft.headers, ":")} onChange={(e) => setDraft({ ...draft, headers: pairs(e.target.value, ":") })} />
                <Help f={{ what: "Header gửi kèm mỗi yêu cầu, thường là token.", fill: "Ví dụ Authorization: Bearer ${input:my_token}. Không dán token thật ở đây.", where: "Tài liệu của dịch vụ.", why: "Token thật nằm trong kho bí mật của máy; ở đây chỉ ghi chỗ cần điền." }} />
              </label>
            </>
          ) : (
            <>
              <label>
                Lệnh
                <input value={draft.command ?? ""} placeholder="npx" onChange={(e) => setDraft({ ...draft, command: e.target.value })} />
                <Help f={{ what: "Chương trình chạy MCP server.", fill: "Tên lệnh, ví dụ npx, node, uvx.", where: "Mục \"command\" trong mcp.json, hoặc README của server.", why: "Hub chạy lệnh này để mở cổng (chỉ trên máy bạn)." }} />
              </label>
              <label>
                Tham số (mỗi dòng một tham số)
                <textarea rows={3} value={(draft.args ?? []).join("\n")} onChange={(e) => setDraft({ ...draft, args: lines(e.target.value) })} />
              </label>
              <label>
                Biến môi trường (mỗi dòng TÊN=giá trị)
                <textarea rows={2} value={unpair(draft.env, "=").replaceAll("= ", "=")} onChange={(e) => setDraft({ ...draft, env: pairs(e.target.value, "=") })} />
              </label>
            </>
          )}
        </>
      )}
      {secrets.length > 0 && (
        <fieldset>
          <legend>Bí mật (lưu trong kho bí mật của máy, không lưu vào file)</legend>
          {secrets.map((id) => (
            <label key={id}>
              {config.file.inputs.find((i) => i.id === id)?.description ?? id} — {config.secrets[id] ? "đã lưu" : "chưa có"}
              <div className="row">
                <input type="password" autoComplete="off" value={secret[id] ?? ""} onChange={(e) => setSecret({ ...secret, [id]: e.target.value })} />
                <button
                  disabled={!secret[id]}
                  onClick={async () => {
                    await api.setSecret(id, secret[id]);
                    setSecret({ ...secret, [id]: "" });
                  }}
                >
                  Lưu
                </button>
                {config.secrets[id] && <button onClick={() => api.setSecret(id, "")}>Xoá</button>}
              </div>
            </label>
          ))}
        </fieldset>
      )}
      <h4>Tool được dùng</h4>
      <p className="muted">
        Agent chỉ gọi được các tool đã tick. Tool có tên giống thao tác ghi (gửi, tạo, sửa, xoá…) bị khoá. Lấy danh sách không tốn AI Credits
        {runtime === "mock" ? " (runtime mock: danh sách của server giả)" : ""}.
      </p>
      <button onClick={fetchTools} disabled={busy}>
        {busy ? "Đang lấy…" : "Lấy danh sách tool"}
      </button>
      {err && <p className="call-error">{err}</p>}
      <ul className="tool-list">
        {(tools ?? [...ticked].map((t) => ({ name: t, description: "", write: false }))).map((t) => (
          <li key={t.name} className={t.write ? "locked" : ""}>
            <label title={t.description}>
              <input
                type="checkbox"
                disabled={t.write}
                checked={!t.write && ticked.has(t.name)}
                onChange={(e) => {
                  const next = new Set(ticked);
                  if (e.target.checked) next.add(t.name);
                  else next.delete(t.name);
                  setDraft({ ...draft, tools: [...next] });
                }}
              />
              <code>{t.name}</code> {t.write && <span className="chip">ghi · khoá</span>}
              {t.description && <span className="muted"> {t.description}</span>}
            </label>
          </li>
        ))}
      </ul>
      <div className="row actions">
        <button className="primary" onClick={save}>
          Lưu cổng
        </button>
      </div>
    </div>
  );
}

export function AgentForm({ name, config, problem, onSave }: { name: string; config: ConfigView; problem: string | null; onSave: (file: HubFile) => void }) {
  const entry = config.file.agents[name];
  const kind = config.agentKinds.find((k) => k.preset === entry?.preset);
  const [draft, setDraft] = useState(entry);
  useEffect(() => setDraft(entry), [name, entry]);
  if (!entry || !draft) return null;
  const save = () => onSave({ ...config.file, agents: { ...config.file.agents, [name]: draft } });
  const custom = !kind;
  return (
    <div className="detail form">
      <div className="row">
        <h3>
          <span className="tag agent">Agent</span> {draft.displayName ?? kind?.displayName ?? name}
        </h3>
        <code>{name}</code>
      </div>
      {problem && <p className="call-error">{problem}</p>}
      <label className="check">
        <input type="checkbox" checked={draft.enabled !== false} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked ? undefined : false })} /> Chạy agent này khi check việc
      </label>
      <label>
        Tên hiển thị
        <input value={draft.displayName ?? ""} placeholder={kind?.displayName ?? name} maxLength={80} onChange={(e) => setDraft({ ...draft, displayName: e.target.value || undefined })} />
      </label>
      <label>
        Mô tả ngắn
        <input value={draft.description ?? ""} placeholder={kind?.description} maxLength={300} onChange={(e) => setDraft({ ...draft, description: e.target.value || undefined })} />
      </label>
      <fieldset>
        <legend>Đọc qua cổng</legend>
        {Object.entries(config.file.servers).map(([key, g]) => (
          <label key={key} className="check">
            <input
              type="checkbox"
              checked={draft.servers.includes(key)}
              onChange={(e) => setDraft({ ...draft, servers: e.target.checked ? [...draft.servers, key] : draft.servers.filter((s) => s !== key) })}
            />
            {g.label ?? config.gateKinds.find((k) => k.preset === g.preset)?.label ?? key}
          </label>
        ))}
      </fieldset>
      <label>
        Thế nào là việc cần làm
        <textarea rows={3} value={draft.todoRule ?? kind?.todoRule ?? ""} maxLength={2000} onChange={(e) => setDraft({ ...draft, todoRule: e.target.value })} />
        <Help
          f={{
            what: "Quy tắc để agent quyết định một mục (mail, work item, PR…) có phải việc bạn cần làm không.",
            fill: "Viết bằng lời, ví dụ: work item giao cho tôi, chưa Done; PR chờ tôi review.",
            where: "Cách bạn tự lọc việc mỗi sáng.",
            why: "Mục đúng quy tắc thành card \"Cần làm\"; mục khác vào \"Mục khác\".",
          }}
        />
      </label>
      {custom && (
        <>
          <label>
            Vai trò
            <textarea rows={2} value={draft.role ?? ""} maxLength={2000} placeholder="Bạn là agent đọc … của người dùng." onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
            <Help f={{ what: "Câu giới thiệu agent cho model.", fill: "Một câu: agent đọc gì, cho ai.", where: "Tự viết.", why: "Giúp model hiểu nhiệm vụ và chọn đúng tool." }} />
          </label>
          <label>
            Việc cần đọc
            <textarea rows={4} value={draft.task ?? ""} maxLength={6000} placeholder="Liệt kê … trong khoảng thời gian được giao. ref = …" onChange={(e) => setDraft({ ...draft, task: e.target.value })} />
            <Help f={{ what: "Lời giao việc gửi agent mỗi lần check việc.", fill: "Đọc gì, lọc thế nào, ref (định danh) của mỗi mục là gì.", where: "Tự viết; xem agent có sẵn để tham khảo.", why: "Agent làm đúng việc, ít gọi tool thừa, đỡ credit." }} />
          </label>
        </>
      )}
      <details>
        <summary>Nâng cao</summary>
        <label>
          Model
          <input value={draft.model ?? ""} placeholder="để trống = mặc định" maxLength={100} onChange={(e) => setDraft({ ...draft, model: e.target.value || undefined })} />
          <Help f={{ what: "Model chạy agent này.", fill: "Tên model Copilot cho phép, hoặc để trống.", where: "Bộ chọn model của Copilot Chat trong VS Code.", why: "Việc đọc đơn giản dùng model rẻ hơn; eval cho biết model nào đủ tốt." }} />
        </label>
        {!custom && (
          <label>
            Việc cần đọc (thay lời giao có sẵn)
            <textarea rows={4} value={draft.task ?? ""} maxLength={6000} placeholder="Để trống = dùng lời giao có sẵn (đã chỉnh theo kết quả ở Work)" onChange={(e) => setDraft({ ...draft, task: e.target.value || undefined })} />
          </label>
        )}
      </details>
      <div className="row actions">
        <button className="primary" onClick={save}>
          Lưu agent
        </button>
      </div>
    </div>
  );
}
