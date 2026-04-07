import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface Node extends d3.SimulationNodeDatum {
  id: string;
  group: number;
  label: string;
  radius: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  label: string;
}

const SystemArchitectureGraph: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 800;
    const height = 600;

    // Clear previous graph if any
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('width', '100%')
      .style('height', 'auto')
      .style('max-width', '100%');

    // Define the data based on the hardware code and description
    const nodes: Node[] = [
      { id: 'esp32', group: 1, label: 'ESP32-WROOM-32 (Brain)', radius: 40 },
      { id: 'sonar_oh', group: 2, label: 'AJ-SR04M (Overhead)', radius: 30 },
      { id: 'sonar_ug', group: 2, label: 'AJ-SR04M (Underground)', radius: 30 },
      { id: 'zht103', group: 2, label: 'ZHT103 (Current Sensor)', radius: 30 },
      { id: 'relay', group: 3, label: 'SSR-40DA (Pump Relay)', radius: 30 },
      { id: 'hivemq', group: 4, label: 'HiveMQ Cloud (MQTT)', radius: 45 },
      { id: 'firestore', group: 5, label: 'Firebase/Firestore', radius: 40 },
      { id: 'webapp', group: 6, label: 'HydroSync Web App', radius: 40 },
      { id: 'mobileapp', group: 6, label: 'HydroSync Mobile App', radius: 40 },
    ];

    const links: Link[] = [
      { source: 'sonar_oh', target: 'esp32', label: 'Water Level' },
      { source: 'sonar_ug', target: 'esp32', label: 'Water Level' },
      { source: 'zht103', target: 'esp32', label: 'Pump Current' },
      { source: 'esp32', target: 'relay', label: 'Control Signal' },
      { source: 'esp32', target: 'hivemq', label: 'Publish Telemetry' },
      { source: 'hivemq', target: 'esp32', label: 'Subscribe Commands' },
      { source: 'hivemq', target: 'firestore', label: 'Data Sync' },
      { source: 'firestore', target: 'webapp', label: 'Real-time Updates' },
      { source: 'webapp', target: 'firestore', label: 'Send Commands' },
      { source: 'firestore', target: 'mobileapp', label: 'Real-time Updates' },
      { source: 'mobileapp', target: 'firestore', label: 'Send Commands' },
    ];

    // Color scale
    const color = d3.scaleOrdinal<number, string>()
      .domain([1, 2, 3, 4, 5, 6])
      .range(['#06b6d4', '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6']);

    // Simulation
    const simulation = d3.forceSimulation<Node>(nodes)
      .force('link', d3.forceLink<Node, Link>(links).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(d => (d as Node).radius + 10));

    // Arrow marker for links
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('xoverflow', 'visible')
      .append('svg:path')
      .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
      .attr('fill', '#94a3b8')
      .style('stroke', 'none');

    // Draw links
    const link = svg.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#475569')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#arrowhead)');

    // Draw link labels
    const linkLabel = svg.append('g')
      .selectAll('text')
      .data(links)
      .join('text')
      .attr('font-size', '10px')
      .attr('fill', '#94a3b8')
      .attr('text-anchor', 'middle')
      .text(d => d.label);

    // Draw nodes
    const node = svg.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(d3.drag<SVGGElement, Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    node.append('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => color(d.group))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('filter', 'drop-shadow(0px 4px 6px rgba(0,0,0,0.3))');

    node.append('text')
      .attr('dy', d => d.radius + 15)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('fill', '#fff')
      .style('pointer-events', 'none')
      .style('text-shadow', '0px 2px 4px rgba(0,0,0,0.8)')
      .text(d => d.label);

    // Simulation tick updates
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as Node).x!)
        .attr('y1', d => (d.source as Node).y!)
        .attr('x2', d => (d.target as Node).x!)
        .attr('y2', d => (d.target as Node).y!);

      linkLabel
        .attr('x', d => ((d.source as Node).x! + (d.target as Node).x!) / 2)
        .attr('y', d => ((d.source as Node).y! + (d.target as Node).y!) / 2 - 5);

      node
        .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, []);

  return (
    <div className="w-full bg-[#111827]/50 backdrop-blur-sm border border-white/5 rounded-3xl p-4 overflow-hidden">
      <svg ref={svgRef} className="w-full h-full min-h-[400px] md:min-h-[600px] cursor-grab active:cursor-grabbing" />
    </div>
  );
};

export default SystemArchitectureGraph;
