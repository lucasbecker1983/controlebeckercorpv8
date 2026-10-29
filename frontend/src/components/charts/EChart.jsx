import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer]);

const TOKENS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6', '--chart-grid', '--md-on-surface', '--md-container', '--md-outline', '--md-danger', '--md-warning', '--md-success'];

export function readChartTheme() {
  const cs = getComputedStyle(document.documentElement);
  const t = {};
  TOKENS.forEach((key) => { t[key] = cs.getPropertyValue(key).trim(); });
  return {
    series: [t['--chart-1'], t['--chart-2'], t['--chart-3'], t['--chart-4'], t['--chart-5'], t['--chart-6']],
    grid: t['--chart-grid'],
    text: t['--md-on-surface'],
    surface: t['--md-container'],
    outline: t['--md-outline'],
    danger: t['--md-danger'],
    warning: t['--md-warning'],
    success: t['--md-success'],
  };
}

// Observa a troca de tema para redesenhar os gráficos com as cores certas.
export function useChartTheme() {
  const [theme, setTheme] = useState(() => readChartTheme());
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readChartTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

export function baseAxis(theme) {
  return {
    axisLine: { lineStyle: { color: theme.outline } },
    axisTick: { show: false },
    axisLabel: { color: theme.text, opacity: 0.6, fontSize: 11 },
    splitLine: { lineStyle: { color: theme.grid } },
  };
}

export function baseTooltip(theme) {
  return {
    trigger: 'axis',
    backgroundColor: theme.surface,
    borderColor: theme.outline,
    textStyle: { color: theme.text, fontSize: 12 },
    axisPointer: { lineStyle: { color: theme.outline } },
  };
}

export default function EChart({ option, height = 260, className = '', onEvents }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current) return undefined;
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' });
    chartRef.current = chart;
    const resize = () => chart.resize();
    const observer = new ResizeObserver(resize);
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && option) chartRef.current.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onEvents) return undefined;
    Object.entries(onEvents).forEach(([name, handler]) => chart.on(name, handler));
    return () => Object.entries(onEvents).forEach(([name, handler]) => chart.off(name, handler));
  }, [onEvents]);

  return <div ref={ref} className={className} style={{ height, width: '100%' }} />;
}
