// components/StatCard.jsx
import React from 'react';
// import { LucideIcon } from 'lucide-react'; // Not needed for JS runtime

const StatCard = ({ title, value, icon: Icon, color }) => {
    return (
        <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 className="stat-label">{title}</h3>
                {Icon && <Icon size={24} color={color || 'var(--text-secondary)'} />}
            </div>
            <div className="stat-value">{value}</div>
        </div>
    );
};

export default StatCard;
