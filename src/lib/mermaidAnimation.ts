/**
 * Smooth draw-in animation for Mermaid SVG diagrams.
 *
 * Strategy: pure CSS animations injected via <style> tags + CSS custom properties.
 * Avoids WAAPI fill:'forwards' which is unreliable in WKWebView (Tauri).
 * Nodes are NEVER set to opacity:0 via inline style — CSS handles initial state
 * only within the animation keyframe itself (animation-fill-mode: both).
 */

const STYLE_ID = 'mermaid-anim-styles';

function ensureAnimationStyles(_svgEl: SVGSVGElement): void {
  // Inject styles into the SVG's shadow or the document head once
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes mermaid-node-in {
      from { opacity: 0; transform: scale(0.88) translateY(4px); }
      to   { opacity: 1; transform: scale(1)    translateY(0);   }
    }
    @keyframes mermaid-edge-draw {
      from { stroke-dashoffset: var(--edge-len, 1000); opacity: 0.2; }
      to   { stroke-dashoffset: 0;                     opacity: 1;   }
    }
    @keyframes mermaid-label-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .mermaid-anim-node {
      animation: mermaid-node-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      animation-delay: var(--node-delay, 0ms);
    }
    .mermaid-anim-edge {
      animation: mermaid-edge-draw 0.55s cubic-bezier(0, 0.55, 0.45, 1) both;
      animation-delay: var(--edge-delay, 0ms);
      stroke-dasharray: var(--edge-len, 1000);
      stroke-dashoffset: var(--edge-len, 1000);
    }
    .mermaid-anim-label {
      animation: mermaid-label-in 0.25s ease both;
      animation-delay: var(--label-delay, 0ms);
    }
  `;
  document.head.appendChild(style);
}

export function animateSvgDrawIn(svgElement: SVGSVGElement): void {
  ensureAnimationStyles(svgElement);

  // ── 1. Collect nodes ────────────────────────────────────────────────────────
  const nodeGroups: Element[] = [];
  svgElement.querySelectorAll('g.node').forEach(n => nodeGroups.push(n));
  svgElement.querySelectorAll('g.actor').forEach(n => nodeGroups.push(n));
  svgElement.querySelectorAll('g.stateGroup').forEach(n => nodeGroups.push(n));
  svgElement.querySelectorAll('g.classGroup').forEach(n => nodeGroups.push(n));

  // Fallback: individual shapes when no semantic groups exist
  if (nodeGroups.length === 0) {
    svgElement.querySelectorAll('.node > rect, .node > circle, .node > polygon, .node > ellipse, .node > path')
      .forEach(n => nodeGroups.push(n));
  }

  nodeGroups.forEach((node, i) => {
    // Remove stale animation class first (in case of re-render)
    node.classList.remove('mermaid-anim-node');
    // Force reflow so removing + re-adding the class restarts the animation
    void (node as HTMLElement).offsetWidth;
    (node as HTMLElement).style.setProperty('--node-delay', `${i * 50}ms`);
    node.classList.add('mermaid-anim-node');
  });

  // ── 2. Collect edges ─────────────────────────────────────────────────────────
  const edgePaths: SVGPathElement[] = [];
  svgElement.querySelectorAll('g.edgePaths path, .flowchart-link').forEach(el => {
    if (el instanceof SVGPathElement) edgePaths.push(el);
  });
  // sequence diagram lines
  svgElement.querySelectorAll('.messageLine0, .messageLine1').forEach(el => {
    if (el instanceof SVGPathElement) edgePaths.push(el);
  });

  const edgeBaseDelay = Math.min(nodeGroups.length * 50, 200);

  edgePaths.forEach((edge, i) => {
    let len = 400;
    try { len = Math.ceil(edge.getTotalLength()) || 400; } catch { /* skip */ }

    edge.classList.remove('mermaid-anim-edge');
    // Force reflow
    void (edge as any).offsetWidth;
    (edge as SVGElement).style.setProperty('--edge-len', `${len}`);
    (edge as SVGElement).style.setProperty('--edge-delay', `${edgeBaseDelay + i * 40}ms`);
    edge.classList.add('mermaid-anim-edge');
  });

  // ── 3. Edge labels + text ────────────────────────────────────────────────────
  const labelDelay = edgeBaseDelay + edgePaths.length * 40 * 0.5;
  const labelSelectors = [
    'g.edgeLabels .edgeLabel',
    'text.messageText',
    'text.loopText',
    'text.noteText',
  ];

  let li = 0;
  labelSelectors.forEach(sel => {
    svgElement.querySelectorAll(sel).forEach(el => {
      if (nodeGroups.includes(el)) return;
      el.classList.remove('mermaid-anim-label');
      void (el as HTMLElement).offsetWidth;
      (el as HTMLElement).style.setProperty('--label-delay', `${labelDelay + li * 25}ms`);
      el.classList.add('mermaid-anim-label');
      li++;
    });
  });
}
