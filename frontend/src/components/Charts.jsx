// components/Charts.jsx
import React from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
);

const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            position: 'bottom',
            labels: {
                color: '#94a3b8',
                font: { family: 'Inter' }
            }
        },
        tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleColor: '#f1f5f9',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 10
        }
    },
    scales: {
        x: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#94a3b8' }
        },
        y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#94a3b8' }
        }
    }
};

export const DailyTrendChart = ({ data }) => {
    const datasets = [
        {
            label: 'Total Almuerzos',
            data: data.map(d => d.lunches),
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.2)',
            tension: 0.3,
            fill: true,
            pointRadius: 4,
            pointHoverRadius: 6
        }
    ];

    if (data.some(d => d.type_normal > 0)) {
        datasets.push({
            label: 'Normal',
            data: data.map(d => d.type_normal),
            borderColor: '#7dd3fc',
            backgroundColor: 'rgba(125, 211, 252, 0.1)',
            tension: 0.3,
            fill: false,
            borderDash: [5, 5],
            pointRadius: 3
        });
    }
    if (data.some(d => d.type_dieta > 0)) {
        datasets.push({
            label: 'Dieta',
            data: data.map(d => d.type_dieta),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.3,
            fill: false,
            borderDash: [5, 5],
            pointRadius: 3
        });
    }
    if (data.some(d => d.type_gerencia > 0)) {
        datasets.push({
            label: 'Gerencia',
            data: data.map(d => d.type_gerencia),
            borderColor: '#a78bfa',
            backgroundColor: 'rgba(167, 139, 250, 0.1)',
            tension: 0.3,
            fill: false,
            borderDash: [5, 5],
            pointRadius: 3
        });
    }
    if (data.some(d => d.type_visita > 0)) {
        datasets.push({
            label: 'Visita',
            data: data.map(d => d.type_visita),
            borderColor: '#fb923c',
            backgroundColor: 'rgba(251, 146, 60, 0.1)',
            tension: 0.3,
            fill: false,
            borderDash: [5, 5],
            pointRadius: 3
        });
    }
    if (data.some(d => d.type_extra > 0)) {
        datasets.push({
            label: 'Extra',
            data: data.map(d => d.type_extra),
            borderColor: '#fbbf24',
            backgroundColor: 'rgba(251, 191, 36, 0.1)',
            tension: 0.3,
            fill: false,
            borderDash: [5, 5],
            pointRadius: 3
        });
    }

    const chartData = {
        labels: data.map(d => d.date),
        datasets
    };
    return <div className="chart-container"><Line options={commonOptions} data={chartData} /></div>;
};

export const LunchTypeChart = ({ data }) => {
    // data = { type_normal, type_dieta, type_gerencia, type_visita, type_extra }
    const labels = [];
    const values = [];
    const bgColors = [];
    const borderColors = [];

    if (data.type_normal > 0) {
        labels.push('Normal');
        values.push(data.type_normal);
        bgColors.push('rgba(125, 211, 252, 0.7)');
        borderColors.push('#7dd3fc');
    }
    if (data.type_dieta > 0) {
        labels.push('Dieta');
        values.push(data.type_dieta);
        bgColors.push('rgba(16, 185, 129, 0.7)');
        borderColors.push('#10b981');
    }
    if (data.type_gerencia > 0) {
        labels.push('Gerencia');
        values.push(data.type_gerencia);
        bgColors.push('rgba(167, 139, 250, 0.7)');
        borderColors.push('#a78bfa');
    }
    if (data.type_visita > 0) {
        labels.push('Visita');
        values.push(data.type_visita);
        bgColors.push('rgba(251, 146, 60, 0.7)');
        borderColors.push('#fb923c');
    }
    if (data.type_extra > 0) {
        labels.push('Extra');
        values.push(data.type_extra);
        bgColors.push('rgba(251, 191, 36, 0.7)');
        borderColors.push('#fbbf24');
    }

    // Fallback if no data
    if (labels.length === 0) {
        labels.push('Sin datos');
        values.push(1);
        bgColors.push('rgba(148, 163, 184, 0.2)');
        borderColors.push('#475569');
    }

    const chartData = {
        labels,
        datasets: [
            {
                data: values,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 2,
                hoverOffset: 8
            },
        ],
    };
    const doughnutOptions = {
        ...commonOptions,
        cutout: '60%',
        scales: { x: { display: false }, y: { display: false } },
        plugins: {
            ...commonOptions.plugins,
            legend: {
                ...commonOptions.plugins.legend,
                labels: {
                    ...commonOptions.plugins.legend.labels,
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 16
                }
            }
        }
    };
    return <div className="chart-container"><Doughnut options={doughnutOptions} data={chartData} /></div>;
};
