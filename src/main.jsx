import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './gui/App.jsx';
import './styles/styles.css';
import './styles/workspace.css';
import './styles/operands.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
