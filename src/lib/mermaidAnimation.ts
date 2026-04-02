export function animateSvgDrawIn(svgElement: SVGSVGElement): void {
  // 节点淡入（先）
  const nodes = svgElement.querySelectorAll('g.node');
  nodes.forEach((node, i) => {
    (node as SVGElement).style.opacity = '0';
    setTimeout(() => {
      (node as SVGElement).style.transition = 'opacity 0.3s ease';
      (node as SVGElement).style.opacity = '1';
    }, i * 50);
  });

  // 连线绘制（后）
  const edges = svgElement.querySelectorAll('g.edgePaths path');
  edges.forEach((edge, i) => {
    if (!(edge instanceof SVGPathElement)) return;
    const length = edge.getTotalLength();
    edge.style.strokeDasharray = String(length);
    edge.style.strokeDashoffset = String(length);
    setTimeout(() => {
      edge.style.transition = 'stroke-dashoffset 0.8s ease-out';
      edge.style.strokeDashoffset = '0';
    }, 300 + i * 100);
  });
}
