import { useState, useEffect, useRef, useCallback } from 'react';
import { listNotes } from '../services/noteService';
import { analyzeProjects } from '../services/projectService';

// ─── shared palette ──────────────────────────────────────────────────────────

const STATUS_COLOR = {
  complete: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  ongoing:  { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  planning: { bg: '#fefce8', text: '#a16207', border: '#fde68a' },
};

const BAR_FILL   = { complete: '#059669', ongoing: '#2563eb', planning: '#d97706' };
const BAR_LIGHT  = { complete: '#d1fae5', ongoing: '#dbeafe', planning: '#fef3c7' };

// ─── Gantt chart ─────────────────────────────────────────────────────────────

const LW  = 175;  // label column width (fixed, never zooms)
const CW0 = 700;  // base chart width at zoom 1×
const HH  = 54;   // header height
const RH  = 72;   // row height per project
const BH  = 28;   // bar height
const BO  = (RH - BH) / 2;

function parseD(str) {
  if (!str) return null;
  const d = new Date(str + 'T12:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function truncate(str, maxChars) {
  return str.length > maxChars ? str.slice(0, maxChars - 1) + '…' : str;
}

// Generate calendar ticks appropriate for the current px-per-month density
function buildTicks(padStart, padEnd, pxPerMonth) {
  const ticks = [];

  if (pxPerMonth >= 80) {
    // Weekly ticks
    const cur = new Date(padStart);
    cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7)); // back to Monday
    while (cur <= padEnd) {
      ticks.push({ date: new Date(cur), isMinor: cur.getDay() !== 1 || cur.getDate() > 7 });
      cur.setDate(cur.getDate() + 7);
    }
  } else {
    // Monthly (or multi-monthly) ticks
    const monthSpan =
      (padEnd.getFullYear() - padStart.getFullYear()) * 12 +
      padEnd.getMonth() - padStart.getMonth();
    const step = pxPerMonth < 12 ? 6 : pxPerMonth < 20 ? 3 : pxPerMonth < 40 ? 2 : 1;
    const cur = new Date(padStart.getFullYear(), padStart.getMonth(), 1);
    while (cur <= padEnd) {
      ticks.push({ date: new Date(cur), isMinor: false, monthSpan });
      cur.setMonth(cur.getMonth() + step);
    }
  }
  return ticks;
}

function fmtTickLabel(d, prevD, pxPerMonth) {
  if (pxPerMonth >= 80) {
    // Weekly mode: "Jan 5" and show year on first of year
    const isNewYear = !prevD || prevD.getFullYear() !== d.getFullYear();
    return isNewYear
      ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  const isNewYear = !prevD || prevD.getFullYear() !== d.getFullYear();
  return isNewYear
    ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : d.toLocaleDateString('en-US', { month: 'short' });
}

function GanttChart({ projects }) {
  const [zoom,    setZoom]    = useState(1);
  const [selRect, setSelRect] = useState(null); // { x1,y1,x2,y2 } in SVG coords
  const containerRef = useRef(null);
  const zoomRef      = useRef(1);
  const dragRef      = useRef(null);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  // Collect all dates
  const allDates = [today];
  for (const p of projects) {
    const dd = parseD(p.final_deadline);
    if (dd) allDates.push(dd);
    for (const st of p.stages || []) {
      const a = parseD(st.start_date), b = parseD(st.end_date);
      if (a) allDates.push(a);
      if (b) allDates.push(b);
    }
  }
  const ms   = allDates.map(d => d.getTime());
  const tMin = Math.min(...ms);
  const tMax = Math.max(...ms);
  const hasDates = allDates.length > 1 && tMax > tMin;

  const padStart = new Date(tMin - 22 * 86400000);
  const padEnd   = new Date(tMax + 46 * 86400000);
  const span     = padEnd - padStart;

  const CW     = CW0 * zoom;
  const TW     = LW + CW;
  const toX    = d => d ? LW + ((d.getTime() - padStart.getTime()) / span) * CW : null;
  const todayX = toX(today);

  // Inverse: SVG x → Date (for selection labels)
  const xToDate = (svgX) => {
    const frac = Math.max(0, Math.min(1, (svgX - LW) / CW));
    return new Date(padStart.getTime() + frac * span);
  };
  const fmtSel = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });

  // Adaptive ticks
  const monthSpan =
    (padEnd.getFullYear() - padStart.getFullYear()) * 12 +
    padEnd.getMonth() - padStart.getMonth() || 1;
  const pxPerMonth = CW / monthSpan;
  const ticks  = buildTicks(padStart, padEnd, pxPerMonth);
  const chartH = HH + projects.length * RH + 28;

  // ── Helper: client coords → SVG coords (accounts for scroll) ─────────────
  const getSvgCoords = useCallback((clientX, clientY) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: clientX - r.left + el.scrollLeft, y: clientY - r.top };
  }, []);

  // ── Wheel: scroll-to-zoom (vertical) + trackpad pan (horizontal) ──────────
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;

    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // Two-finger horizontal swipe → pan
      el.scrollLeft += e.deltaX;
      return;
    }

    // Vertical scroll → zoom anchored at cursor
    const r        = el.getBoundingClientRect();
    const xInView  = e.clientX - r.left;
    const xAbs     = xInView + el.scrollLeft;
    const frac     = Math.max(0, (xAbs - LW) / (CW0 * zoomRef.current));
    const factor   = e.deltaY < 0 ? 1.12 : 1 / 1.12;

    setZoom(prev => {
      const next = Math.min(10, Math.max(0.3, prev * factor));
      zoomRef.current = next;
      requestAnimationFrame(() => {
        if (containerRef.current)
          containerRef.current.scrollLeft = frac * CW0 * next + LW - xInView;
      });
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ── Rubber-band zoom: mouse-down starts a drag selection ─────────────────
  const startDrag = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const { x: x0, y: y0 } = getSvgCoords(e.clientX, e.clientY);
    if (x0 < LW) return; // ignore label column

    dragRef.current = { x1: x0, y1: y0, moved: false };

    const onMove = (ev) => {
      const { x, y } = getSvgCoords(ev.clientX, ev.clientY);
      const d = dragRef.current;
      if (!d) return;
      if (!d.moved && Math.abs(x - d.x1) > 6) d.moved = true;
      if (d.moved) setSelRect({ x1: d.x1, y1: d.y1, x2: x, y2: y });
    };

    const onUp = (ev) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      const d = dragRef.current;
      dragRef.current = null;
      setSelRect(null);
      if (!d?.moved) return;

      const { x: x2 } = getSvgCoords(ev.clientX, ev.clientY);
      const selX1 = Math.min(d.x1, x2);
      const selX2 = Math.max(d.x1, x2);
      const selW  = selX2 - selX1;
      if (selW < 10) return;

      const el      = containerRef.current;
      if (!el) return;
      const viewW   = el.clientWidth;
      const curZoom = zoomRef.current;
      const frac1   = Math.max(0, (selX1 - LW) / (CW0 * curZoom));
      const newZoom = Math.min(10, Math.max(0.3, (viewW / selW) * curZoom));

      setZoom(newZoom);
      zoomRef.current = newZoom;
      requestAnimationFrame(() => {
        if (containerRef.current)
          containerRef.current.scrollLeft = frac1 * CW0 * newZoom;
      });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [getSvgCoords]);

  // ── Zoom buttons ──────────────────────────────────────────────────────────
  const zoomBy = (factor) => {
    const el  = containerRef.current;
    const mid = el ? el.scrollLeft + el.clientWidth / 2 : LW;
    const frac = Math.max(0, (mid - LW) / (CW0 * zoomRef.current));
    setZoom(prev => {
      const next = Math.min(10, Math.max(0.3, prev * factor));
      zoomRef.current = next;
      requestAnimationFrame(() => {
        if (containerRef.current)
          containerRef.current.scrollLeft = frac * CW0 * next + LW - containerRef.current.clientWidth / 2;
      });
      return next;
    });
  };

  if (!hasDates) {
    return <div style={{ padding: '18px 0', color: '#9ca3af', fontSize: '13px' }}>No date information found — chart unavailable.</div>;
  }

  const pct = Math.round(zoom * 100);

  // Selection rect geometry (clamped to chart area)
  const sel = selRect ? {
    left:   Math.max(LW, Math.min(selRect.x1, selRect.x2)),
    right:  Math.min(TW,  Math.max(selRect.x1, selRect.x2)),
    top:    HH,
    bottom: chartH - 28,
  } : null;

  return (
    <div style={{ marginBottom: '30px' }}>

      {/* Legend + zoom controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', padding: '10px 0 14px' }}>
        <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px', color: '#374151' }}>
          {Object.entries(BAR_FILL).map(([k, color]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ display: 'inline-block', width: 24, height: 11, background: color, borderRadius: 3 }} />
              {{ complete: 'Complete', ongoing: 'In Progress', planning: 'Planning' }[k]}
            </span>
          ))}
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width={14} height={14}><line x1={7} y1={0} x2={7} y2={14} stroke="#dc2626" strokeWidth={2} strokeDasharray="3,2"/></svg>
            Today
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width={14} height={12}><polygon points="7,0 14,12 0,12" fill="#7c3aed"/></svg>
            Deadline
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', color: '#9ca3af' }}>scroll↕ zoom · drag▭ select</span>
          <button onClick={() => zoomBy(1 / 1.35)} style={zBtn} title="Zoom out">−</button>
          <span style={{ minWidth: '50px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#374151', fontFamily: 'monospace' }}>
            {pct}%
          </span>
          <button onClick={() => zoomBy(1.35)} style={zBtn} title="Zoom in">+</button>
          <button onClick={() => { setZoom(1); zoomRef.current = 1; }} style={{ ...zBtn, width: 'auto', fontSize: '11px', padding: '0 10px' }}>
            Reset
          </button>
        </div>
      </div>

      {/* Chart container */}
      <div
        ref={containerRef}
        style={{ overflowX: 'auto', overflowY: 'hidden', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', userSelect: 'none' }}
      >
        <svg
          width={TW} height={chartH}
          style={{ display: 'block', fontFamily: 'system-ui, -apple-system, sans-serif', background: 'white', borderRadius: '10px', cursor: selRect ? 'crosshair' : 'crosshair' }}
          onMouseDown={startDrag}
        >
          {/* Row shading */}
          {projects.map((_, pi) => (
            <rect key={pi} x={0} y={HH + pi * RH} width={TW} height={RH}
                  fill={pi % 2 === 0 ? '#fff' : '#f8fafc'} />
          ))}

          {/* Grid + tick labels */}
          {ticks.map(({ date: t, isMinor }, i) => {
            const x = toX(t);
            if (x === null || x < LW || x > TW) return null;
            const isYearStart = t.getMonth() === 0 && t.getDate() <= 7;
            return (
              <g key={i}>
                <line x1={x} y1={HH - 6} x2={x} y2={chartH - 12}
                      stroke={isYearStart ? '#c7d2fe' : isMinor ? '#f5f5f5' : '#f0f0f0'}
                      strokeWidth={isYearStart ? 1.5 : 0.8} />
                {!isMinor && (
                  <text x={x} y={HH - 10} textAnchor="middle" fontSize={10}
                        fill={isYearStart ? '#1e40af' : '#9ca3af'}
                        fontWeight={isYearStart ? 700 : 400}>
                    {fmtTickLabel(t, ticks[i - 1]?.date, pxPerMonth)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Header + separator */}
          <text x={12} y={HH - 10} fontSize={10} fill="#6b7280" fontWeight={700}>PROJECT</text>
          <line x1={LW} y1={0} x2={LW} y2={chartH - 12} stroke="#e2e8f0" strokeWidth={1.5} />
          <line x1={LW} y1={HH} x2={TW} y2={HH} stroke="#e2e8f0" strokeWidth={1} />

          {/* TODAY line */}
          {todayX !== null && (
            <>
              <line x1={todayX} y1={0} x2={todayX} y2={chartH - 12}
                    stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5,3" opacity={0.85} />
              <rect x={todayX - 20} y={4} width={40} height={16} rx={8} fill="#ef4444" />
              <text x={todayX} y={15} textAnchor="middle" fontSize={9} fill="white" fontWeight={700}>TODAY</text>
              <polygon points={`${todayX},${HH + 1} ${todayX - 5},${HH - 7} ${todayX + 5},${HH - 7}`} fill="#ef4444" />
            </>
          )}

          {/* Project rows */}
          {projects.map((project, pi) => {
            const rowY    = HH + pi * RH;
            const barY    = rowY + BO;
            const deadline = parseD(project.final_deadline);

            const resolved = (project.stages || []).map((st, si, arr) => {
              let sd = parseD(st.start_date);
              let ed = parseD(st.end_date);
              if (!ed) {
                if (st.status === 'ongoing') ed = today;
                else if (st.status === 'planning' && deadline) ed = deadline;
                else if (si + 1 < arr.length && parseD(arr[si + 1].start_date))
                  ed = parseD(arr[si + 1].start_date);
              }
              if (!sd && si > 0) sd = parseD(arr[si - 1].end_date);
              return { ...st, sd, ed, x1: sd ? toX(sd) : null, x2: ed ? toX(ed) : null };
            });

            const xVals = resolved.flatMap(r => [r.x1, r.x2]).filter(v => v !== null);
            if (deadline) { const dx = toX(deadline); if (dx !== null) xVals.push(dx); }
            const projX1 = xVals.length ? Math.min(...xVals) : LW;
            const projX2 = xVals.length ? Math.max(...xVals) : LW + CW;

            return (
              <g key={pi}>
                <text x={LW - 12} y={rowY + RH / 2 + 5} textAnchor="end" fontSize={12} fill="#111827" fontWeight={700}>
                  {truncate(project.name, 22)}
                </text>
                <circle cx={LW - 4} cy={rowY + RH / 2} r={4} fill={BAR_FILL[project.overall_status] || BAR_FILL.planning} />
                <rect x={projX1} y={barY + 6} width={Math.max(projX2 - projX1, 6)} height={BH - 12} fill="#f1f5f9" rx={3} />

                {resolved.map((st, si) => {
                  const fill   = BAR_FILL[st.status]  || BAR_FILL.planning;
                  const light  = BAR_LIGHT[st.status] || BAR_LIGHT.planning;
                  const isPlan = st.status === 'planning';
                  if (st.x1 === null && st.x2 === null) return null;
                  const x1 = st.x1 !== null ? st.x1 : projX1;
                  const x2 = st.x2 !== null ? st.x2 : (deadline ? toX(deadline) : projX2) ?? projX2;
                  const w  = Math.max(x2 - x1, 6);
                  return (
                    <g key={si}>
                      <rect x={x1} y={barY} width={w} height={BH}
                            fill={isPlan ? light : fill}
                            stroke={isPlan ? fill : 'none'} strokeWidth={isPlan ? 1.5 : 0}
                            strokeDasharray={isPlan ? '4,2' : 'none'}
                            rx={5} opacity={isPlan ? 0.9 : 0.92}>
                        <title>{st.name} · {st.start_date || '?'} → {st.end_date || (st.status === 'ongoing' ? 'present' : '?')}</title>
                      </rect>
                      {w >= 36 && (
                        <text x={x1 + w / 2} y={barY + BH / 2 + 4} textAnchor="middle" fontSize={10}
                              fill={isPlan ? fill : 'white'} fontWeight={600} style={{ pointerEvents: 'none' }}>
                          {truncate(st.name, Math.floor(w / 6.5))}
                        </text>
                      )}
                      {st.sd && <circle cx={x1} cy={barY + BH / 2} r={4.5} fill="white" stroke={fill} strokeWidth={2}><title>{st.start_date}</title></circle>}
                      {st.ed && st.status === 'complete' && <circle cx={x2} cy={barY + BH / 2} r={4.5} fill={fill} stroke="white" strokeWidth={1.5}><title>{st.end_date}</title></circle>}
                      {st.status === 'ongoing' && todayX !== null && todayX >= x1 && todayX <= x2 + 20 && (
                        <g>
                          <polygon points={`${todayX},${barY - 2} ${todayX - 5},${barY - 11} ${todayX + 5},${barY - 11}`} fill="#ef4444" />
                          <text x={todayX} y={barY - 13} textAnchor="middle" fontSize={8} fill="#ef4444" fontWeight={700}>NOW</text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {deadline && (() => {
                  const dx = toX(deadline);
                  if (dx === null) return null;
                  return (
                    <g>
                      <line x1={dx} y1={barY - 2} x2={dx} y2={barY + BH + 2} stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="3,2" opacity={0.7} />
                      <polygon points={`${dx},${barY - 4} ${dx - 7},${barY - 15} ${dx + 7},${barY - 15}`} fill="#7c3aed"><title>Deadline: {project.final_deadline}</title></polygon>
                      <text x={dx} y={barY - 18} textAnchor="middle" fontSize={8} fill="#7c3aed" fontWeight={700}>DUE</text>
                    </g>
                  );
                })()}

                <line x1={0} y1={rowY + RH} x2={TW} y2={rowY + RH} stroke="#e2e8f0" strokeWidth={0.5} />
              </g>
            );
          })}

          {/* Bottom axis */}
          <line x1={LW} y1={chartH - 12} x2={TW} y2={chartH - 12} stroke="#cbd5e1" strokeWidth={1} />

          {/* ── Rubber-band selection overlay ── */}
          {sel && (() => {
            const selW = sel.right - sel.left;
            const selH = sel.bottom - sel.top;
            const dateL = xToDate(sel.left);
            const dateR = xToDate(sel.right);
            return (
              <g style={{ pointerEvents: 'none' }}>
                {/* Dim areas outside selection */}
                <rect x={LW} y={sel.top} width={sel.left - LW} height={selH} fill="rgba(0,0,0,0.10)" />
                <rect x={sel.right} y={sel.top} width={TW - sel.right} height={selH} fill="rgba(0,0,0,0.10)" />
                {/* Selection box */}
                <rect x={sel.left} y={sel.top} width={selW} height={selH}
                      fill="rgba(37,99,235,0.07)"
                      stroke="#2563eb" strokeWidth={1.5} strokeDasharray="5,3" />
                {/* Left edge handle */}
                <line x1={sel.left} y1={sel.top} x2={sel.left} y2={sel.bottom} stroke="#2563eb" strokeWidth={2} />
                {/* Right edge handle */}
                <line x1={sel.right} y1={sel.top} x2={sel.right} y2={sel.bottom} stroke="#2563eb" strokeWidth={2} />
                {/* Date label: left */}
                <rect x={sel.left + 4} y={sel.top + 6} width={72} height={16} rx={4} fill="#2563eb" />
                <text x={sel.left + 40} y={sel.top + 17} textAnchor="middle" fontSize={10} fill="white" fontWeight={700}>
                  {fmtSel(dateL)}
                </text>
                {/* Date label: right (only if wide enough) */}
                {selW > 90 && (
                  <>
                    <rect x={sel.right - 76} y={sel.top + 6} width={72} height={16} rx={4} fill="#2563eb" />
                    <text x={sel.right - 40} y={sel.top + 17} textAnchor="middle" fontSize={10} fill="white" fontWeight={700}>
                      {fmtSel(dateR)}
                    </text>
                  </>
                )}
                {/* "Release to zoom" hint */}
                {selW > 120 && (
                  <text x={sel.left + selW / 2} y={sel.top + selH / 2 + 5} textAnchor="middle" fontSize={11} fill="#2563eb" fontWeight={600} opacity={0.7}>
                    Release to zoom
                  </text>
                )}
              </g>
            );
          })()}
        </svg>
      </div>

      <div style={{ marginTop: '8px', fontSize: '11px', color: '#9ca3af', textAlign: 'right' }}>
        Scroll ↕ to zoom · drag to select & zoom in · scroll ↔ to pan
      </div>
    </div>
  );
}

const zBtn = {
  height: '28px', minWidth: '28px', fontSize: '16px', fontWeight: 700,
  background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px',
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  lineHeight: 1, padding: '0 4px',
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const c = STATUS_COLOR[status] || STATUS_COLOR.planning;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: '12px', fontSize: '12px',
      fontWeight: 600, background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>
      {status}
    </span>
  );
}

// ─── Per-project card ─────────────────────────────────────────────────────────

function ProjectCard({ project }) {
  const c = STATUS_COLOR[project.overall_status] || STATUS_COLOR.planning;
  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: '10px', marginBottom: '20px', overflow: 'hidden' }}>
      <div style={{ background: c.bg, padding: '14px 18px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '16px', color: '#1f2937', marginBottom: '4px' }}>{project.name}</div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Source: {project.source_notes.join(', ')}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <StatusBadge status={project.overall_status} />
          {project.final_deadline && (
            <span style={{ fontSize: '12px', color: '#6b7280' }}>Deadline: <strong>{project.final_deadline}</strong></span>
          )}
        </div>
      </div>
      <div style={{ padding: '0 18px 14px' }}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Stage</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Start</th>
              <th style={s.th}>End</th>
              <th style={s.th}>Details</th>
            </tr>
          </thead>
          <tbody>
            {project.stages.map((stage, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fafafa' : 'white' }}>
                <td style={{ ...s.td, fontWeight: 600 }}>{stage.name}</td>
                <td style={s.td}><StatusBadge status={stage.status} /></td>
                <td style={{ ...s.td, fontFamily: 'monospace', fontSize: '13px' }}>{stage.start_date || '—'}</td>
                <td style={{ ...s.td, fontFamily: 'monospace', fontSize: '13px' }}>{stage.end_date || '—'}</td>
                <td style={{ ...s.td, color: '#4b5563' }}>{stage.details || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Unified timeline table ───────────────────────────────────────────────────

function UnifiedTimeline({ unified }) {
  return (
    <div>
      {unified.summary && (
        <div style={{ marginBottom: '18px', padding: '14px 18px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#374151', lineHeight: '1.6' }}>
          {unified.summary}
        </div>
      )}
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Date</th>
            <th style={s.th}>Project</th>
            <th style={s.th}>Milestone</th>
            <th style={s.th}>Status</th>
            <th style={s.th}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {(unified.entries || []).map((entry, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fafafa' : 'white' }}>
              <td style={{ ...s.td, fontFamily: 'monospace', fontSize: '13px', whiteSpace: 'nowrap' }}>{entry.date || '—'}</td>
              <td style={{ ...s.td, fontWeight: 600, color: '#1f2937' }}>{entry.project}</td>
              <td style={s.td}>{entry.milestone}</td>
              <td style={s.td}><StatusBadge status={entry.status} /></td>
              <td style={{ ...s.td, color: '#6b7280', fontSize: '13px' }}>{entry.notes || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectTracker({ onBack }) {
  const [phase, setPhase]           = useState('select');
  const [notes, setNotes]           = useState([]);
  const [loadingNotes, setLoading]  = useState(true);
  const [selectedIds, setSelected]  = useState(new Set());
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState(null);
  const [activeTab, setActiveTab]   = useState('chart');

  useEffect(() => {
    listNotes({})
      .then(data => { setNotes(data); setLoading(false); })
      .catch(() => { setError('Failed to load notes.'); setLoading(false); });
  }, []);

  const toggleNote = id => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleAnalyze = () => {
    setError(null);
    setPhase('loading');
    analyzeProjects([...selectedIds])
      .then(data => { setResult(data); setActiveTab('chart'); setPhase('results'); })
      .catch(() => { setError('Analysis failed. Please try again.'); setPhase('select'); });
  };

  const canSubmit = selectedIds.size > 0;

  // ── Loading ──
  if (loadingNotes) return <div style={s.center}>Loading notes…</div>;

  if (phase === 'loading') return (
    <div style={s.center}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '36px', marginBottom: '14px' }}>📊</div>
        <div style={{ fontSize: '15px', color: '#374151', fontWeight: 600, marginBottom: '6px' }}>Analyzing projects…</div>
        <div style={{ fontSize: '13px', color: '#9ca3af' }}>Reading notes and building timeline</div>
      </div>
    </div>
  );

  // ── Results ──
  if (phase === 'results' && result) {
    const projects = result.projects || [];
    const unified  = result.unified_timeline || {};

    return (
      <div style={{ ...s.container, maxWidth: '980px' }}>
        <div style={s.row}>
          <h2 style={s.heading}>Project Reports</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={s.backBtn} onClick={() => setPhase('select')}>← Analyze Again</button>
            <button style={s.backBtn} onClick={onBack}>← Back to Notes</button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '24px' }}>
          {[
            { key: 'chart',    label: 'Gantt Chart' },
            { key: 'projects', label: `Per-Project Reports (${projects.length})` },
            { key: 'unified',  label: `Unified Timeline (${(unified.entries || []).length})` },
          ].map(({ key, label }) => (
            <button key={key}
              onClick={() => setActiveTab(key)}
              style={{ ...s.tab, ...(activeTab === key ? s.tabActive : {}) }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Gantt chart tab */}
        {activeTab === 'chart' && (
          projects.length === 0
            ? <p style={{ color: '#9ca3af' }}>No projects found in the selected notes.</p>
            : <GanttChart projects={projects} />
        )}

        {/* Per-project tab */}
        {activeTab === 'projects' && (
          projects.length === 0
            ? <p style={{ color: '#9ca3af' }}>No projects found in the selected notes.</p>
            : projects.map((p, i) => <ProjectCard key={i} project={p} />)
        )}

        {/* Unified timeline tab */}
        {activeTab === 'unified' && <UnifiedTimeline unified={unified} />}
      </div>
    );
  }

  // ── Select phase ──
  return (
    <div style={s.container}>
      <div style={s.row}>
        <h2 style={s.heading}>Project Check & Schedule</h2>
        <button style={s.backBtn} onClick={onBack}>← Back to Notes</button>
      </div>
      <p style={s.sub}>
        Select notes that contain project information. The agent reads all selected notes,
        extracts every project, timeline, and status, then generates a Gantt chart + two reports.
      </p>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.section}>
        <div style={s.row}>
          <label style={s.label}>
            Select notes{' '}
            <span style={{ fontWeight: 400, color: '#6b7280' }}>({selectedIds.size} of {notes.length} selected)</span>
          </label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button style={s.smallBtn} onClick={() => setSelected(new Set(notes.map(n => n.id)))}>Select all</button>
            <button style={s.smallBtn} onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        </div>

        {notes.length === 0
          ? <p style={{ color: '#9ca3af', fontSize: '13px' }}>No notes yet — create some first.</p>
          : (
            <div style={s.noteList}>
              {notes.map(note => (
                <label key={note.id}
                  style={{ ...s.noteRow, background: selectedIds.has(note.id) ? '#eff6ff' : 'white' }}
                >
                  <input type="checkbox"
                    checked={selectedIds.has(note.id)}
                    onChange={() => toggleNote(note.id)}
                    style={{ marginRight: '10px', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.noteTitle}>{note.title || '(Untitled)'}</div>
                    {note.updated_at && (
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                        Updated {new Date(note.updated_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )
        }
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          style={{ ...s.analyzeBtn, opacity: canSubmit ? 1 : 0.45, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
          onClick={handleAnalyze}
          disabled={!canSubmit}
        >
          Analyze {selectedIds.size > 0 ? `${selectedIds.size} ` : ''}Note{selectedIds.size !== 1 ? 's' : ''}
        </button>
        {!canSubmit && <span style={{ fontSize: '13px', color: '#9ca3af' }}>Select at least one note to continue</span>}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  container:  { padding: '24px', maxWidth: '900px', margin: '0 auto', overflowY: 'auto', height: '100%', boxSizing: 'border-box' },
  center:     { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', fontSize: '14px' },
  row:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' },
  heading:    { margin: 0, fontSize: '20px', fontWeight: 700 },
  sub:        { margin: '6px 0 20px', color: '#555', fontSize: '13px', lineHeight: '1.5' },
  error:      { marginBottom: '12px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '13px' },
  section:    { marginBottom: '20px' },
  label:      { display: 'block', fontWeight: 600, fontSize: '13px', color: '#374151', marginBottom: '6px' },
  smallBtn:   { fontSize: '12px', padding: '3px 8px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' },
  noteList:   { border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', maxHeight: '380px', overflowY: 'auto' },
  noteRow:    { display: 'flex', alignItems: 'flex-start', padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' },
  noteTitle:  { fontSize: '14px', color: '#1f2937' },
  analyzeBtn: { padding: '10px 28px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600 },
  backBtn:    { fontSize: '13px', padding: '4px 10px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: '14px', marginTop: '10px' },
  th:         { textAlign: 'left', padding: '8px 12px', background: '#f8f9fa', borderBottom: '2px solid #dee2e6', fontSize: '12px', fontWeight: 700, color: '#495057', textTransform: 'uppercase', letterSpacing: '0.05em' },
  td:         { padding: '9px 12px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' },
  tab:        { padding: '8px 18px', fontSize: '14px', fontWeight: 500, background: 'none', border: 'none', borderBottom: '3px solid transparent', cursor: 'pointer', color: '#6b7280', marginBottom: '-2px' },
  tabActive:  { color: '#7c3aed', borderBottomColor: '#7c3aed', fontWeight: 700 },
};
