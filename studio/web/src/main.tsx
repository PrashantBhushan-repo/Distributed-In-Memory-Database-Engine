import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { installApiTransport } from './utils/api';
installApiTransport();
const root = document.getElementById('root')!;
const application = <React.StrictMode><App /></React.StrictMode>;
const pathname = window.location.pathname.replace(/\/$/, '') || '/';
const prerendered = pathname === '/' || pathname === '/compare/redis';
if (prerendered && root.hasChildNodes()) ReactDOM.hydrateRoot(root, application);
else { root.replaceChildren(); ReactDOM.createRoot(root).render(application); }
