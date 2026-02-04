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
import { Line, Doughnut, Bar } from 'react-chartjs-2';

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
    // Expects data prop to be array of { date, lunches, tickets }
    const chartData = {
        labels: data.map(d => d.date),
        datasets: [
            {
                label: 'Almuerzos',
                data: data.map(d => d.lunches),
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.2)',
                tension: 0.2,
                fill: true
            }
        ]
    };
    return <div className="chart-container"><Line options={commonOptions} data={chartData} /></div>;
};

export const LunchTypeChart = ({ data }) => {
    // Expects data to be { type_normal: 100, type_special: 20 } aggregated
    const chartData = {
        labels: ['Almuerzo Normal', 'Almuerzo Dieta'],
        datasets: [
            {
                data: [data.type_normal, data.type_special],
                backgroundColor: ['#38bdf8', '#10b981'],
                borderColor: ['rgba(56, 189, 248, 1)', 'rgba(16, 185, 129, 1)'],
                borderWidth: 1,
            },
        ],
    };
    const doughnutOptions = {
        ...commonOptions,
        scales: { x: { display: false }, y: { display: false } }
    };
    return <div className="chart-container"><Doughnut options={doughnutOptions} data={chartData} /></div>;
};
