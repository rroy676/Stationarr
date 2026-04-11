import React from 'react'

// Apply saved theme before first render to avoid flash
const savedTheme = localStorage.getItem('stationarr_theme') || 'auto';
if (savedTheme === 'light') document.documentElement.setAttribute('data-theme', 'light');
else if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');;
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
