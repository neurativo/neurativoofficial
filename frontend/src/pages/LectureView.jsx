import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    ArrowLeft, Download, Share2, FileText, MessageCircle, CreditCard,
    HelpCircle, BookOpen, BarChart2, Clock, AlignLeft, Star, Minimize2,
    Globe, Eye, Monitor, Send, Shield, ChevronLeft, ChevronRight,
    Shuffle, Copy, X, GraduationCap, Play, ChevronDown, ChevronUp,
    Timer, CheckCircle, XCircle,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import ExportModal from '../components/ExportModal';
import QAAnswer from '../components/QAAnswer';
import { useSEO } from '../lib/useSEO';
import { renderDomainContent } from '../lib/renderDomainContent.jsx';
import JobProgress from '../components/JobProgress.jsx';
import { useCreditsApi } from '../lib/creditsApi.js';
import BetaFeedbackCard from '../components/BetaFeedbackCard.jsx';
import { trackPageview } from '../lib/trackPageview';

function fmtTs(seconds) {
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
    bg: 'var(--color-bg)', text: 'var(--color-text)', sec: 'var(--color-sec)', muted: 'var(--color-muted)',
    border: 'var(--color-border)', borderHov: 'var(--color-border-hov)', card: 'var(--color-card)', dark: 'var(--color-dark)',
    darkFg: 'var(--color-dark-fg)',
};

const CSS = `
  .lv * { box-sizing: border-box; }
  .lv { font-family: 'Inter', sans-serif; background: ${C.bg}; color: ${C.text}; height: 100vh; display: flex; flex-direction: column; -webkit-font-smoothing: antialiased; }

  /* Navbar */
  .lv-nav { height: 52px; background: ${C.card}; border-bottom: 1px solid ${C.border}; display: flex; align-items: center; padding: 0 20px; gap: 12px; flex-shrink: 0; }
  .lv-back { display: flex; align-items: center; gap: 5px; font-size: 13px; color: ${C.sec}; text-decoration: none; transition: color 0.12s; white-space: nowrap; }
  .lv-back:hover { color: ${C.text}; }
  .lv-nav-title { flex: 1; font-size: 14px; font-weight: 500; color: ${C.text}; letter-spacing: -0.2px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 12px; }
  .lv-nav-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .lv-btn-ghost { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; font-size: 12px; font-weight: 500; color: ${C.text}; border: 1px solid ${C.border}; border-radius: 8px; background: ${C.card}; cursor: pointer; transition: border-color 0.15s; font-family: inherit; white-space: nowrap; }
  .lv-btn-ghost:hover { border-color: ${C.borderHov}; }
  .lv-credits-chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 8px; border: 1px solid ${C.border}; background: ${C.card}; font-size: 12px; font-weight: 500; color: ${C.sec}; text-decoration: none; transition: border-color .15s; white-space: nowrap; }
  .lv-credits-chip:hover { border-color: ${C.borderHov}; color: ${C.text}; }
  .lv-credits-chip.low { border-color: #fde68a; background: #fef3c7; color: #b45309; }
  .lv-credits-chip.sub { border-color: rgba(22,163,74,0.35); background: rgba(22,163,74,0.07); color: #16a34a; }

  /* Two-panel body */
  .lv-body { display: flex; flex: 1; overflow: hidden; }

  /* Left panel */
  .lv-left { width: 50%; border-right: 1px solid ${C.border}; display: flex; flex-direction: column; overflow: hidden; }
  .lv-panel-header { padding: 16px 20px 12px; border-bottom: 1px solid ${C.border}; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .lv-panel-label { font-size: 11px; font-weight: 600; color: ${C.muted}; letter-spacing: 0.5px; text-transform: uppercase; flex: 1; }
  .lv-panel-meta { font-size: 11px; color: ${C.muted}; }
  .lv-transcript-list { flex: 1; overflow-y: auto; padding: 0 0; display: flex; flex-direction: column; }
  .lv-segment { display: flex; gap: 14px; padding: 10px 20px; border-bottom: 1px solid ${C.border}; transition: background 0.15s; }
  .lv-segment:last-child { border-bottom: none; }
  .lv-seg-num { font-size: 10px; color: ${C.muted}; font-family: 'JetBrains Mono', monospace; min-width: 42px; padding-top: 3px; flex-shrink: 0; line-height: 1.6; text-align: right; }
  .lv-seg-text { font-size: 14px; color: ${C.sec}; line-height: 1.75; flex: 1; }
  .lv-seg-live { border-left: 3px solid #6366f1; padding-left: 17px; }
  .lv-seg-live .lv-seg-text { color: ${C.text}; font-weight: 500; }
  @keyframes lv-chunk-in { from { opacity: 0; } to { opacity: 1; } }
  .lv-chunk-enter { animation: lv-chunk-in 0.25s ease; }
  .lv-empty-panel { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 13px; color: ${C.muted}; }

  /* Right panel */
  .lv-right { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .lv-tabs { display: flex; border-bottom: 1px solid ${C.border}; padding: 0 16px; flex-shrink: 0; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  .lv-tabs::-webkit-scrollbar { display: none; }
  .lv-tab { display: inline-flex; align-items: center; gap: 4px; padding: 13px 11px 11px; font-size: 13px; font-weight: 500; color: ${C.muted}; background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color 0.12s, border-color 0.12s; font-family: inherit; white-space: nowrap; flex-shrink: 0; }
  .lv-tab.active { color: ${C.text}; border-bottom-color: ${C.text}; }
  .lv-tab-icon { width: 13px; height: 13px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; opacity: 0.65; }
  .lv-tab.active .lv-tab-icon { opacity: 1; }
  .lv-tab-body { flex: 1; overflow-y: auto; padding: 20px; }

  /* Transcript search */
  .lv-transcript-search { padding: 8px 16px 4px; flex-shrink: 0; }
  .lv-search-input { width: 100%; padding: 6px 10px; border: 1px solid ${C.border}; border-radius: 7px; font-size: 12px; color: ${C.text}; background: ${C.bg}; outline: none; font-family: inherit; transition: border-color .15s; }
  .lv-search-input:focus { border-color: ${C.borderHov}; }
  .lv-search-input::placeholder { color: ${C.muted}; }
  .lv-seg-highlight { background: #fef08a; border-radius: 2px; }

  /* Concept cards — modern borderless shadow design */
  @keyframes lv-card-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .lv-sum-card {
    background: ${C.card}; border: 1px solid ${C.border}; border-radius: 16px;
    margin-bottom: 12px; overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
    animation: lv-card-in 0.22s ease both;
    transition: box-shadow 0.2s;
  }
  .dark .lv-sum-card { box-shadow: 0 2px 12px rgba(0,0,0,0.35); }
  .lv-sum-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.09), 0 8px 24px rgba(0,0,0,0.07); }
  .dark .lv-sum-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
  /* Stagger animation for multiple cards */
  .lv-sum-card:nth-child(1) { animation-delay: 0ms; }
  .lv-sum-card:nth-child(2) { animation-delay: 40ms; }
  .lv-sum-card:nth-child(3) { animation-delay: 80ms; }
  .lv-sum-card:nth-child(4) { animation-delay: 120ms; }
  .lv-sum-card:nth-child(n+5) { animation-delay: 160ms; }

  /* Card section row — used for each content block */
  .lv-cs { border-top: 1px solid ${C.border}; padding: 12px 16px; }
  /* Pill chip label inside sections */
  .lv-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: ${C.muted}; background: rgba(0,0,0,0.05); border-radius: 99px; padding: 3px 9px; margin-bottom: 9px; }
  .dark .lv-chip { background: rgba(255,255,255,0.08); }
  .lv-chip-amber { color: #b45309; background: #fef3c7; }
  .dark .lv-chip-amber { color: #fbbf24; background: rgba(245,158,11,0.15); }
  .lv-chip-green { color: #15803d; background: #dcfce7; }
  .dark .lv-chip-green { color: #6ee7b7; background: rgba(16,185,129,0.15); }

  /* VS comparison grid */
  .lv-vs-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: stretch; }
  .lv-vs-cell { padding: 9px 11px; border: 1px solid ${C.border}; border-radius: 10px; background: ${C.bg}; font-size: 12px; color: ${C.sec}; line-height: 1.55; }
  .lv-vs-badge { align-self: center; display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; background: ${C.bg}; border: 1px solid ${C.border}; font-size: 8px; font-weight: 800; color: ${C.muted}; flex-shrink: 0; }
  .lv-vs-label { font-size: 9px; font-weight: 700; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 5px; }

  /* Examples list */
  .lv-ex-row { display: flex; align-items: baseline; gap: 7px; font-size: 12px; color: ${C.sec}; line-height: 1.6; margin-bottom: 4px; }
  .lv-ex-arrow { color: #1d9e75; font-weight: 700; flex-shrink: 0; font-size: 11px; }

  /* Two-col bottom row (remember / mistake) */
  .lv-bottom-grid { display: grid; gap: 8px; }
  .lv-bottom-cell { padding: 10px 12px; border-radius: 11px; font-size: 12px; line-height: 1.6; }

  .lv-trust-note { font-size: 12px; color: ${C.muted}; margin: 0 0 14px; line-height: 1.55; }
  .lv-aid-panel { margin-top: 16px; background: ${C.card}; border: 1px dashed ${C.borderHov}; border-radius: 12px; padding: 14px 16px; }
  .lv-aid-title { font-size: 12px; font-weight: 600; color: ${C.text}; margin-bottom: 6px; }
  .lv-aid-copy { font-size: 12px; color: ${C.muted}; line-height: 1.55; margin-bottom: 10px; }
  .lv-aid-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .lv-aid-chip { font-size: 11px; color: ${C.sec}; border: 1px solid ${C.border}; border-radius: 999px; padding: 4px 8px; background: ${C.bg}; }

  /* QA */
  .lv-qa-messages { display: flex; flex-direction: column; gap: 10px; padding-bottom: 16px; }
  .lv-qa-msg { padding: 11px 14px; border-radius: 14px; font-size: 13px; line-height: 1.65; max-width: 86%; }
  .lv-qa-user { background: ${C.dark}; color: #fafaf9; align-self: flex-end; border-bottom-right-radius: 4px; }
  .lv-qa-assistant { background: ${C.card}; border: 1px solid ${C.border}; color: ${C.text}; align-self: flex-start; border-bottom-left-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
  .dark .lv-qa-assistant { box-shadow: 0 2px 8px rgba(0,0,0,0.25); }
  .lv-qa-src { font-size: 10px; color: ${C.muted}; margin-top: 4px; padding-left: 2px; display: flex; align-items: center; gap: 4px; }
  .lv-qa-bar { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid ${C.border}; flex-shrink: 0; background: ${C.card}; }
  .lv-qa-input { flex: 1; padding: 10px 14px; border: 1px solid ${C.border}; border-radius: 24px; font-size: 13px; color: ${C.text}; background: ${C.bg}; outline: none; transition: border-color 0.15s, box-shadow 0.15s; font-family: inherit; }
  .lv-qa-input:focus { border-color: ${C.borderHov}; box-shadow: 0 0 0 3px rgba(0,0,0,0.04); }
  .lv-qa-input::placeholder { color: ${C.muted}; }
  .lv-qa-send { width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: ${C.dark}; color: #fafaf9; border: none; border-radius: 50%; cursor: pointer; transition: opacity 0.15s, transform 0.1s; }
  .lv-qa-send:hover { opacity: 0.85; transform: scale(1.05); }
  .lv-qa-send:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
  /* Follow-up chips */
  .lv-followup-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; padding-left: 2px; }
  .lv-followup-chip { font-size: 11px; color: ${C.sec}; border: 1px solid ${C.border}; border-radius: 999px; padding: 4px 10px; background: ${C.bg}; cursor: pointer; transition: border-color 0.15s, background 0.15s; white-space: nowrap; }
  .lv-followup-chip:hover { border-color: ${C.borderHov}; background: ${C.card}; }
  /* Empty state */
  .lv-qa-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 48px 16px 16px; }
  .lv-qa-empty-icon { width: 42px; height: 42px; border-radius: 12px; background: ${C.card}; border: 1px solid ${C.border}; display: flex; align-items: center; justify-content: center; color: ${C.muted}; }
  .lv-qa-empty-text { font-size: 14px; font-weight: 500; color: ${C.text}; margin-bottom: 2px; }
  .lv-qa-empty-sub { font-size: 12px; color: ${C.muted}; }
  .lv-qa-chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 4px; }
  .lv-qa-chip { font-size: 12px; color: ${C.sec}; border: 1px solid ${C.border}; border-radius: 999px; padding: 5px 12px; background: ${C.card}; cursor: pointer; transition: border-color 0.15s, color 0.15s; font-family: inherit; }
  .lv-qa-chip:hover { border-color: ${C.borderHov}; color: ${C.text}; }
  /* Typing dots */
  @keyframes lv-dot { 0%,80%,100% { transform: scale(0.55); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
  .lv-qa-typing { display: flex; align-items: center; gap: 4px; padding: 12px 14px; background: ${C.card}; border: 1px solid ${C.border}; border-radius: 14px; border-bottom-left-radius: 4px; align-self: flex-start; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
  .lv-qa-dot { width: 6px; height: 6px; border-radius: 50%; background: ${C.muted}; animation: lv-dot 1.3s infinite; }
  .lv-qa-dot:nth-child(2) { animation-delay: 0.15s; }
  .lv-qa-dot:nth-child(3) { animation-delay: 0.3s; }

  /* Stats */
  .lv-stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .lv-stat-full { grid-column: 1 / -1; }
  .lv-stat-card { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 14px; padding: 14px 16px; transition: box-shadow 0.15s; }
  .lv-stat-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.07); }
  .dark .lv-stat-card:hover { box-shadow: 0 2px 14px rgba(0,0,0,0.3); }
  .lv-stat-icon { width: 30px; height: 30px; border-radius: 9px; background: ${C.bg}; border: 1px solid ${C.border}; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; color: ${C.muted}; }
  .lv-stat-label { font-size: 10px; color: ${C.muted}; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 4px; }
  .lv-stat-val { font-size: 22px; font-weight: 700; color: ${C.text}; letter-spacing: -0.8px; line-height: 1.1; }
  .lv-stat-sub { font-size: 11px; color: ${C.muted}; margin-top: 3px; }
  .lv-stat-topic-row { display: flex; align-items: center; gap: 8px; }
  .lv-stat-divider { height: 1px; background: ${C.border}; margin: 4px 0; }

  /* Pills */
  .lv-pill { font-size: 11px; padding: 2px 8px; border-radius: 5px; white-space: nowrap; }
  .lv-pill-topic { background: #f3f0ff; color: #7c3aed; border: 1px solid #e9d5ff; }
  .lv-pill-lang { background: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe; }
  .lv-topic-wrap { position: relative; display: inline-block; }
  .lv-topic-dropdown {
    position: absolute; top: calc(100% + 6px); left: 0; z-index: 50;
    background: var(--color-card); border: 1px solid var(--color-border);
    border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.10);
    padding: 8px; min-width: 200px; max-height: 260px; overflow-y: auto;
  }
  .lv-topic-option {
    padding: 7px 10px; border-radius: 7px; font-size: 12px; cursor: pointer;
    color: var(--color-text); transition: background 0.1s;
    text-transform: capitalize;
  }
  .lv-topic-option:hover { background: var(--color-bg); }
  .lv-topic-option.selected { background: #f3f0ff; color: #7c3aed; font-weight: 500; }
  .lv-topic-custom { width: 100%; margin-top: 6px; padding: 6px 8px; font-size: 12px;
    border: 1px solid var(--color-border); border-radius: 7px; outline: none;
    font-family: 'Inter', sans-serif; background: var(--color-bg); color: var(--color-text);
  }

  /* Loading */
  .lv-loading { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 13px; color: ${C.muted}; }

  /* Post-lecture rating card */
  .lv-rate-card {
    margin-top: 20px;
    background: ${C.card};
    border: 1px solid ${C.border};
    border-radius: 16px;
    padding: 18px 20px 16px;
    animation: lv-card-in 0.3s ease both;
  }
  .lv-rate-title { font-size: 14px; font-weight: 600; color: ${C.text}; margin-bottom: 4px; }
  .lv-rate-sub { font-size: 12px; color: ${C.muted}; margin-bottom: 14px; }
  .lv-rate-stars { display: flex; gap: 5px; margin-bottom: 12px; }
  .lv-rate-star {
    font-size: 26px; cursor: pointer;
    transition: transform 0.1s, filter 0.1s;
    line-height: 1; background: none; border: none; padding: 0;
    filter: grayscale(1) opacity(0.35);
  }
  .lv-rate-star.active, .lv-rate-star.hover { filter: none; transform: scale(1.12); }
  .lv-rate-star.hover { transform: scale(1.18); }
  .lv-rate-textarea {
    width: 100%; padding: 9px 12px;
    border: 1px solid ${C.border}; border-radius: 10px;
    font-size: 12px; line-height: 1.6; color: ${C.text};
    background: ${C.bg}; resize: none; outline: none;
    font-family: 'Inter', sans-serif; box-sizing: border-box;
    transition: border-color 0.15s;
  }
  .lv-rate-textarea:focus { border-color: ${C.borderHov}; }
  .lv-rate-textarea::placeholder { color: ${C.muted}; }
  .lv-rate-actions { display: flex; gap: 8px; margin-top: 10px; }
  .lv-rate-skip {
    padding: 7px 14px; font-size: 12px; font-weight: 500;
    border: 1px solid ${C.border}; border-radius: 9px;
    background: none; color: ${C.muted}; cursor: pointer;
    font-family: inherit; transition: border-color 0.12s, color 0.12s;
  }
  .lv-rate-skip:hover { border-color: ${C.borderHov}; color: ${C.sec}; }
  .lv-rate-submit {
    padding: 7px 18px; font-size: 12px; font-weight: 600;
    border: none; border-radius: 9px;
    background: ${C.dark}; color: ${C.darkFg};
    cursor: pointer; font-family: inherit;
    transition: opacity 0.12s;
  }
  .lv-rate-submit:disabled { opacity: 0.35; cursor: not-allowed; }
  .lv-rate-submit:not(:disabled):hover { opacity: 0.85; }
  .lv-rate-thanks {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 0 2px; font-size: 13px; color: ${C.sec};
  }
  .lv-rate-thanks-icon {
    width: 28px; height: 28px; border-radius: 50%;
    background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; flex-shrink: 0;
  }

  /* Share modal */
  .lv-share-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; animation: lv-chunk-in 0.15s ease; }
  .lv-share-box { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 20px; width: 100%; max-width: 420px; padding: 0; box-shadow: 0 12px 48px rgba(0,0,0,0.22); overflow: hidden; animation: lv-card-in 0.2s ease; }
  .lv-share-header { padding: 20px 20px 16px; border-bottom: 1px solid ${C.border}; display: flex; align-items: center; gap: 10px; }
  .lv-share-header-icon { width: 36px; height: 36px; border-radius: 10px; background: ${C.bg}; border: 1px solid ${C.border}; display: flex; align-items: center; justify-content: center; color: ${C.sec}; flex-shrink: 0; }
  .lv-share-title { flex: 1; font-size: 15px; font-weight: 600; color: ${C.text}; letter-spacing: -0.3px; margin: 0; }
  .lv-share-close { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; color: ${C.muted}; border-radius: 8px; transition: background 0.12s, color 0.12s; flex-shrink: 0; }
  .lv-share-close:hover { background: ${C.bg}; color: ${C.text}; }
  .lv-share-body { padding: 20px; display: flex; flex-direction: column; gap: 18px; }
  .lv-share-section { display: flex; flex-direction: column; gap: 8px; }
  .lv-share-label { font-size: 10px; font-weight: 700; color: ${C.muted}; text-transform: uppercase; letter-spacing: 0.6px; }
  .lv-share-toggle { display: flex; gap: 6px; }
  .lv-share-opt { flex: 1; padding: 8px 10px; font-size: 12px; font-weight: 500; background: ${C.bg}; border: 1px solid ${C.border}; border-radius: 10px; cursor: pointer; color: ${C.sec}; font-family: inherit; transition: all 0.12s; text-align: center; }
  .lv-share-opt.active { background: ${C.dark}; color: #fafaf9; border-color: transparent; }
  .lv-share-mode-note { font-size: 11px; color: ${C.muted}; line-height: 1.55; }
  .lv-share-expiry { display: flex; gap: 6px; flex-wrap: wrap; }
  .lv-share-exp-btn { padding: 5px 12px; font-size: 12px; font-weight: 500; border: 1px solid ${C.border}; border-radius: 8px; background: ${C.bg}; cursor: pointer; color: ${C.sec}; font-family: inherit; transition: all 0.12s; }
  .lv-share-exp-btn.active { border-color: ${C.dark}; background: ${C.dark}; color: #fafaf9; }
  .lv-share-gen { width: 100%; padding: 11px 0; background: ${C.dark}; color: #fafaf9; border: none; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: opacity 0.15s; letter-spacing: -0.1px; }
  .lv-share-gen:hover { opacity: 0.85; }
  .lv-share-gen:disabled { opacity: 0.4; cursor: default; }
  .lv-share-url-box { background: ${C.bg}; border: 1px solid ${C.border}; border-radius: 12px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; }
  .lv-share-url { flex: 1; font-size: 11px; color: ${C.muted}; font-family: 'JetBrains Mono', monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lv-share-copy { flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; background: ${C.card}; border: 1px solid ${C.border}; border-radius: 8px; font-size: 11px; font-weight: 600; color: ${C.text}; cursor: pointer; font-family: inherit; transition: border-color 0.12s; white-space: nowrap; }
  .lv-share-copy:hover { border-color: ${C.borderHov}; }
  .lv-share-qr { display: flex; justify-content: center; }
  .lv-share-qr img { border-radius: 12px; border: 1px solid ${C.border}; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
  .lv-share-footer { padding: 14px 20px; border-top: 1px solid ${C.border}; display: flex; align-items: center; justify-content: space-between; }
  .lv-share-expiry-note { font-size: 11px; color: ${C.muted}; }
  .lv-share-revoke { font-size: 12px; color: #ef4444; background: none; border: 1px solid rgba(239,68,68,0.25); border-radius: 8px; padding: 6px 12px; cursor: pointer; font-family: inherit; transition: background 0.12s; }
  .lv-share-revoke:hover { background: rgba(239,68,68,0.06); }

  /* Mobile */
  @media (max-width: 680px) {
    .lv-body { flex-direction: column; }
    .lv-left { width: 100%; border-right: none; overflow: hidden; flex-shrink: 0; }
    .lv-right { flex: 1; min-height: 0; overflow: hidden; }
  }
  @media (max-width: 480px) {
    .lv-nav { padding: 0 12px; gap: 6px; }
    .lv-nav-title { font-size: 13px; padding: 0 6px; }
    .lv-btn-text { display: none; }
    .lv-btn-ghost { padding: 6px 9px; min-width: 32px; justify-content: center; }
    .lv-panel-header { padding: 12px 14px 10px; }
    .lv-tabs { padding: 0 8px; }
    .lv-tab { padding: 12px 9px 10px; font-size: 12px; gap: 3px; }
    .lv-tab-icon { width: 12px; height: 12px; }
    .lv-tab-body { padding: 14px; }
    .lv-qa-bar { padding: 10px 12px; gap: 6px; }
    .lv-qa-input { padding: 9px 10px; font-size: 13px; }
    .lv-qa-send { padding: 9px 12px; font-size: 13px; }
    .lv-stat-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
    .lv-transcript-search { padding: 6px 14px 2px; }
  }
  @media (max-width: 360px) {
    .lv-tab-label { display: none; }
    .lv-tab { padding: 13px 10px; gap: 0; }
    .lv-tab-icon { width: 15px; height: 15px; opacity: 0.8; }
    .lv-tab.active .lv-tab-icon { opacity: 1; }
  }

  /* Smart Explain */
  .lv-explain-btn { position: fixed; z-index: 50; padding: 5px 10px; background: ${C.dark}; color: ${C.darkFg}; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.18); font-family: inherit; animation: lv-chunk-in 0.15s ease; transform: translate(-50%, -100%); white-space: nowrap; }
  .lv-explain-btn:hover { opacity: 0.85; }
  .lv-explain-overlay { position: fixed; inset: 0; z-index: 60; display: flex; justify-content: flex-end; }
  .lv-explain-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.25); backdrop-filter: blur(2px); }
  .lv-explain-panel { position: relative; width: 100%; max-width: 480px; background: ${C.card}; height: 100%; box-shadow: -4px 0 32px rgba(0,0,0,0.12); display: flex; flex-direction: column; border-left: 1px solid ${C.border}; animation: lv-slide-right 0.28s ease; }
  @keyframes lv-slide-right { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: translateX(0); } }
  .lv-explain-header { height: 52px; padding: 0 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid ${C.border}; flex-shrink: 0; }
  .lv-explain-title { font-size: 14px; font-weight: 700; color: ${C.text}; font-family: 'Outfit', sans-serif; display: flex; align-items: center; gap: 8px; }
  .lv-explain-dot { width: 8px; height: 8px; border-radius: 50%; background: ${C.dark}; }
  .lv-explain-close { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; color: ${C.muted}; border-radius: 6px; transition: color 0.12s, background 0.12s; }
  .lv-explain-close:hover { color: ${C.text}; background: ${C.border}; }
  .lv-explain-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 18px; }
  .lv-explain-section-label { font-size: 10px; font-weight: 700; color: ${C.muted}; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px; }
  .lv-explain-text { font-size: 14px; color: ${C.text}; line-height: 1.75; }
  .lv-explain-analogy { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px; }
  .lv-explain-analogy-text { font-size: 13px; color: ${C.sec}; line-height: 1.7; font-style: italic; }
  .lv-explain-step { display: flex; gap: 12px; padding: 10px 12px; background: ${C.bg}; border: 1px solid ${C.border}; border-radius: 8px; }
  .lv-explain-step-num { font-size: 10px; font-weight: 700; color: ${C.muted}; font-family: 'JetBrains Mono', monospace; padding-top: 2px; flex-shrink: 0; min-width: 20px; }
  .lv-explain-step-text { font-size: 13px; color: ${C.sec}; line-height: 1.65; }
  .lv-explain-spinner { width: 32px; height: 32px; border: 3px solid ${C.border}; border-top-color: ${C.dark}; border-radius: 50%; animation: lv-spin 0.7s linear infinite; }
  @keyframes lv-spin { to { transform: rotate(360deg); } }

  /* Drag handle (mobile only) */
  .lv-drag-handle { display: none; height: 24px; align-items: center; justify-content: center; background: ${C.bg}; border-top: 1px solid ${C.border}; border-bottom: 1px solid ${C.border}; cursor: ns-resize; flex-shrink: 0; touch-action: none; user-select: none; }
  .lv-drag-pill { width: 32px; height: 4px; background: ${C.borderHov}; border-radius: 2px; }
  @media (max-width: 680px) {
    .lv-drag-handle { display: flex; }
    .lv-left { border-bottom: none !important; }
  }

  /* Flashcards */
  .lv-fc-wrap { max-width: 500px; margin: 0 auto; }
  .lv-fc-progress { height: 3px; background: var(--color-border); border-radius: 2px; margin-bottom: 18px; overflow: hidden; }
  .lv-fc-progress-bar { height: 100%; background: var(--color-dark); border-radius: 2px; transition: width 0.35s ease; }
  .lv-card-flip { perspective: 1000px; height: 210px; cursor: pointer; margin-bottom: 6px; user-select: none; }
  .lv-card-inner { position: relative; width: 100%; height: 100%; transition: transform 0.48s cubic-bezier(0.4,0,0.2,1); transform-style: preserve-3d; }
  .lv-card-flip.flipped .lv-card-inner { transform: rotateY(180deg); }
  .lv-card-face { position: absolute; inset: 0; border: 1px solid var(--color-border); border-radius: 16px; padding: 20px; background: var(--color-card); backface-visibility: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 6px 24px rgba(0,0,0,0.04); }
  .dark .lv-card-face { box-shadow: 0 4px 20px rgba(0,0,0,0.35); }
  .lv-fc-side-label { position: absolute; top: 12px; left: 16px; font-size: 9px; font-weight: 700; letter-spacing: 0.7em; text-transform: uppercase; color: var(--color-muted); }
  .lv-card-text { font-size: 14px; line-height: 1.65; text-align: center; color: var(--color-text); }
  .lv-card-back { transform: rotateY(180deg); background: var(--color-dark); border-color: transparent; }
  .lv-card-back .lv-fc-side-label { color: rgba(255,255,255,0.35); }
  .lv-card-back .lv-card-text { color: var(--color-dark-fg); }
  .lv-fc-hint { text-align: center; font-size: 11px; color: var(--color-muted); margin-bottom: 16px; letter-spacing: 0.02em; }
  .lv-fc-nav { display: flex; align-items: center; gap: 8px; justify-content: center; }
  .lv-fc-btn { display: inline-flex; align-items: center; gap: 5px; padding: 7px 16px; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-card); font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit; color: var(--color-text); transition: border-color 0.15s, background 0.15s; }
  .lv-fc-btn:hover { border-color: var(--color-border-hov); background: var(--color-bg); }
  .lv-fc-btn:disabled { opacity: 0.35; cursor: default; }
  .lv-fc-count { font-size: 12px; color: var(--color-muted); font-family: 'JetBrains Mono', monospace; min-width: 44px; text-align: center; }

  /* Quiz */
  .lv-quiz-score { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--color-card); border: 1px solid var(--color-border); border-radius: 12px; margin-bottom: 16px; font-size: 13px; color: var(--color-text); font-weight: 500; }
  .lv-quiz-score-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .lv-quiz-q { background: var(--color-card); border: 1px solid var(--color-border); border-radius: 14px; padding: 16px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
  .lv-quiz-qrow { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px; }
  .lv-quiz-num { flex-shrink: 0; width: 24px; height: 24px; border-radius: 7px; background: var(--color-bg); border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: var(--color-muted); font-family: 'JetBrains Mono', monospace; margin-top: 1px; }
  .lv-quiz-qtext { font-size: 13px; font-weight: 500; line-height: 1.6; color: var(--color-text); flex: 1; }
  .lv-quiz-opt { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 9px 12px; margin-bottom: 6px; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-bg); font-size: 12px; cursor: pointer; font-family: inherit; color: var(--color-sec); transition: border-color 0.15s, background 0.15s; }
  .lv-quiz-opt:not(:disabled):hover { border-color: var(--color-border-hov); background: var(--color-card); color: var(--color-text); }
  .lv-quiz-opt-letter { flex-shrink: 0; width: 22px; height: 22px; border-radius: 6px; border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: var(--color-muted); transition: all 0.15s; background: var(--color-card); }
  .lv-quiz-opt.correct { background: #f0fdf4; border-color: #86efac; color: #15803d; }
  .lv-quiz-opt.correct .lv-quiz-opt-letter { background: #86efac; border-color: #86efac; color: #14532d; }
  .lv-quiz-opt.wrong   { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
  .lv-quiz-opt.wrong .lv-quiz-opt-letter   { background: #fecaca; border-color: #fecaca; color: #7f1d1d; }
  .dark .lv-quiz-opt.correct { background: rgba(16,185,129,0.08); border-color: rgba(16,185,129,0.3); color: #6ee7b7; }
  .dark .lv-quiz-opt.correct .lv-quiz-opt-letter { background: rgba(16,185,129,0.2); border-color: rgba(16,185,129,0.4); color: #6ee7b7; }
  .dark .lv-quiz-opt.wrong { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.3); color: #fca5a5; }
  .dark .lv-quiz-opt.wrong .lv-quiz-opt-letter { background: rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.4); color: #fca5a5; }
  .lv-quiz-expl { display: flex; gap: 8px; font-size: 12px; color: var(--color-sec); margin-top: 8px; padding: 9px 12px; background: var(--color-bg); border-radius: 9px; line-height: 1.6; border: 1px solid var(--color-border); }
  .lv-quiz-expl-icon { flex-shrink: 0; font-size: 13px; margin-top: 1px; }

  /* Glossary */
  .lv-gloss-hdr { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
  .lv-gloss-count { font-size: 11px; font-weight: 600; color: var(--color-muted); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 999px; padding: 2px 8px; }
  .lv-gloss-group-letter { font-size: 10px; font-weight: 800; letter-spacing: 0.1em; color: var(--color-muted); text-transform: uppercase; padding: 14px 0 5px; border-bottom: 1px solid var(--color-border); margin-bottom: 6px; }
  .lv-gloss-row { display: flex; gap: 0; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 10px; margin-bottom: 5px; font-size: 13px; background: var(--color-card); transition: box-shadow 0.15s; flex-direction: column; gap: 3px; }
  .lv-gloss-row:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
  .dark .lv-gloss-row:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.3); }
  .lv-gloss-term { font-weight: 600; font-size: 12px; color: var(--color-text); }
  .lv-gloss-def  { color: var(--color-sec); line-height: 1.6; font-size: 12px; }

  /* ── Exam Prep ──────────────────────────────────────────── */
  .lv-exam-filters { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
  .lv-exam-filter { font-size: 11px; border: 1px solid ${C.border}; border-radius: 999px; padding: 4px 12px; background: ${C.bg}; color: ${C.sec}; cursor: pointer; transition: all 0.15s; font-family: inherit; }
  .lv-exam-filter.active { background: ${C.dark}; color: #fafaf9; border-color: ${C.dark}; }
  .lv-exam-q { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 12px; padding: 14px 16px; margin-bottom: 8px; }
  .lv-exam-q-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; cursor: pointer; }
  .lv-exam-q-text { font-size: 13px; font-weight: 500; color: ${C.text}; line-height: 1.55; flex: 1; }
  .lv-exam-diff { font-size: 10px; padding: 2px 8px; border-radius: 999px; font-weight: 600; white-space: nowrap; flex-shrink: 0; margin-top: 1px; }
  .lv-exam-diff-easy   { background: #dcfce7; color: #15803d; }
  .lv-exam-diff-medium { background: #fef9c3; color: #a16207; }
  .lv-exam-diff-hard   { background: #fee2e2; color: #b91c1c; }
  .dark .lv-exam-diff-easy   { background: #14532d; color: #4ade80; }
  .dark .lv-exam-diff-medium { background: #713f12; color: #fde047; }
  .dark .lv-exam-diff-hard   { background: #7f1d1d; color: #fca5a5; }
  .lv-exam-reveal-btn { font-size: 11px; color: ${C.sec}; background: none; border: 1px solid ${C.border}; border-radius: 6px; padding: 3px 10px; cursor: pointer; font-family: inherit; white-space: nowrap; transition: all 0.15s; }
  .lv-exam-reveal-btn:hover { border-color: ${C.borderHov}; color: ${C.text}; }
  .lv-exam-answer { margin-top: 12px; padding-top: 12px; border-top: 1px solid ${C.border}; }
  .lv-exam-answer-text { font-size: 13px; color: ${C.text}; line-height: 1.65; margin-bottom: 8px; }
  .lv-exam-kp-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
  .lv-exam-kp-item { font-size: 12px; color: ${C.sec}; padding-left: 14px; position: relative; }
  .lv-exam-kp-item::before { content: '•'; position: absolute; left: 0; color: ${C.muted}; }
  .lv-exam-gen-wrap { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 48px 16px 16px; }

  /* ── Quiz Practice Mode ─────────────────────────────────── */
  .lv-practice-overlay { position: absolute; inset: 0; background: ${C.bg}; z-index: 10; display: flex; flex-direction: column; border-radius: 0 0 16px 16px; overflow: hidden; }
  .lv-practice-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid ${C.border}; flex-shrink: 0; }
  .lv-practice-timer { font-size: 13px; font-weight: 600; color: ${C.text}; display: flex; align-items: center; gap: 5px; }
  .lv-practice-progress { font-size: 12px; color: ${C.muted}; }
  .lv-practice-body { flex: 1; overflow-y: auto; padding: 20px 16px; }
  .lv-practice-q-text { font-size: 14px; font-weight: 500; color: ${C.text}; line-height: 1.6; margin-bottom: 16px; }
  .lv-practice-result { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 32px 16px; text-align: center; }
  .lv-practice-score { font-size: 36px; font-weight: 700; color: ${C.text}; letter-spacing: -1.5px; }
  .lv-practice-score-label { font-size: 13px; color: ${C.muted}; }
  .lv-practice-weak { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
  .lv-practice-weak-chip { font-size: 11px; background: #fee2e2; color: #b91c1c; border-radius: 999px; padding: 3px 10px; }
  .dark .lv-practice-weak-chip { background: #7f1d1d; color: #fca5a5; }

  /* ── Past Attempts ──────────────────────────────────────── */
  .lv-past-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: ${C.sec}; cursor: pointer; padding: 12px 0 0; background: none; border: none; font-family: inherit; }
  .lv-past-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid ${C.border}; border-radius: 10px; margin-bottom: 5px; font-size: 12px; background: ${C.card}; }
  .lv-past-score { font-weight: 600; color: ${C.text}; min-width: 50px; }
  .lv-past-date { color: ${C.muted}; flex: 1; }
  .lv-past-dur { color: ${C.muted}; }

  /* ── Concept Map ────────────────────────────────────────── */
`;

// ─── Accent palette (cycles per card) ────────────────────────────────────────
const ACCENTS_LIGHT = [
    { border: '#c4b5fd', title: '#7c3aed', bg: '#faf5ff' }, // violet
    { border: '#93c5fd', title: '#2563eb', bg: '#eff6ff' }, // blue
    { border: '#6ee7b7', title: '#059669', bg: '#f0fdf4' }, // emerald
    { border: '#fdba74', title: '#c2410c', bg: '#fff7ed' }, // orange
    { border: '#f9a8d4', title: '#be185d', bg: '#fdf2f8' }, // pink
    { border: '#86efac', title: '#15803d', bg: '#f0fdf4' }, // green
];
const ACCENTS_DARK = [
    { border: '#7c3aed', title: '#c4b5fd', bg: '#1e1338' }, // violet
    { border: '#2563eb', title: '#93c5fd', bg: '#0f1e38' }, // blue
    { border: '#059669', title: '#6ee7b7', bg: '#0a2218' }, // emerald
    { border: '#c2410c', title: '#fdba74', bg: '#291508' }, // orange
    { border: '#be185d', title: '#f9a8d4', bg: '#25081e' }, // pink
    { border: '#15803d', title: '#86efac', bg: '#0c1f10' }, // green
];

function useIsDark() {
    const [dark, setDark] = React.useState(() => document.documentElement.classList.contains('dark'));
    React.useEffect(() => {
        const obs = new MutationObserver(() =>
            setDark(document.documentElement.classList.contains('dark'))
        );
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => obs.disconnect();
    }, []);
    return dark;
}

// ─── parseSummary (mirrors App.jsx) ───────────────────────────────────────────
function parseSummary(text) {
    if (!text) return [];
    const trimmed = text.trim();
    if (!trimmed || /^processing/i.test(trimmed)) return [];
    const hasStructuredSections = trimmed.includes('## ');
    const blocks = hasStructuredSections
        ? trimmed.split('## ').filter(s => s.trim())
        : [trimmed];
    return blocks.map((block, idx) => {
        const lines = block.split('\n');
        const title = hasStructuredSections ? lines[0].trim() : (idx === 0 ? 'Summary' : `Section ${idx + 1}`);
        const highlights = [], concepts = [], examples = [], proseLines = [];
        const contentLines = hasStructuredSections ? lines.slice(1) : lines;
        for (const line of contentLines) {
            const l = line.trim();
            if (!l || l === '---') continue;
            if (l.startsWith('>')) { highlights.push(l.replace(/^>\s*/, '')); continue; }
            if (/^key concepts:/i.test(l)) {
                const m = l.match(/`([^`]+)`/g);
                if (m) m.forEach(x => concepts.push(x.replace(/`/g, '').trim()));
                continue;
            }
            if (/^examples:$/i.test(l)) continue;
            if (l.startsWith('→')) { examples.push(l.replace(/^→\s*/, '').trim()); continue; }
            if (l.startsWith('- ')) {
                const c = l.slice(2).trim();
                if (c.startsWith('→') || c.toLowerCase().includes('example') || c.toLowerCase().includes('e.g.')) {
                    examples.push(c.replace(/^→\s*/, ''));
                } else if (/`[^`]+`/.test(c) || c.split(/\s+/).length < 5) {
                    concepts.push(c.replace(/`/g, '').trim());
                } else { proseLines.push(c); }
                continue;
            }
            proseLines.push(l);
        }
        const fullProse = proseLines.map(l => l.replace(/\*\*(.*?)\*\*/g, '$1')).join(' ').trim();
        let lead_sentence = fullProse, prose = '';
        let from = 0, found = false;
        while (from < fullProse.length) {
            const idx = fullProse.indexOf('. ', from);
            if (idx === -1) break;
            if (idx + 1 >= 40) { lead_sentence = fullProse.slice(0, idx + 1); prose = fullProse.slice(idx + 2).trim(); found = true; break; }
            from = idx + 2;
        }
        if (!found) { const fb = fullProse.indexOf('. '); if (fb !== -1) { lead_sentence = fullProse.slice(0, fb + 1); prose = fullProse.slice(fb + 2).trim(); } }
        if (!hasStructuredSections && !fullProse) {
            lead_sentence = lines.map(l => l.trim()).filter(Boolean).join(' ');
            prose = '';
        }
        return { title, lead_sentence, prose, concepts, examples, highlights };
    });
}

function SummaryCard({ section, accent, index, total, topic }) {
    const isDark = useIsDark();
    const a = accent || ACCENTS_LIGHT[0];
    const core = section.core_explanation || section.lead_sentence || '';
    const prose = section.prose || '';
    const definitions = section.key_definitions || [];
    const distinctions = section.important_distinctions || [];
    const traps = section.exam_traps || [];
    const examples = section.examples || [];
    const concepts = section.concepts || [];
    const highlights = section.highlights || [];

    return (
        <div className="lv-sum-card">

            {/* ── Header ── */}
            <div style={{
                padding: '14px 16px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
            }}>
                {/* Accent dot */}
                <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: a.border, flexShrink: 0,
                    boxShadow: `0 0 0 3px ${isDark ? a.bg + '55' : a.bg}`,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: 13, fontWeight: 700, color: a.title,
                        letterSpacing: '-0.2px', lineHeight: 1.3,
                        display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
                    }}>
                        {section.title}
                        {section.verification_status === 'supported' && (
                            <span style={{
                                fontSize: 9, fontWeight: 600, padding: '2px 7px',
                                background: isDark ? 'rgba(16,185,129,0.12)' : '#f0fdf4',
                                border: isDark ? '1px solid rgba(16,185,129,0.25)' : '1px solid #bbf7d0',
                                borderRadius: 999, color: isDark ? '#6ee7b7' : '#15803d',
                                letterSpacing: '0.3px',
                            }}>grounded</span>
                        )}
                    </div>
                </div>
                {total > 1 && (
                    <span style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 9, color: 'var(--color-muted)', flexShrink: 0,
                        background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                        borderRadius: 6, padding: '2px 6px',
                    }}>{index + 1}/{total}</span>
                )}
            </div>

            {/* ── Highlights (accent quote) ── */}
            {highlights.length > 0 && highlights.map((h, i) => (
                <div key={i} className="lv-cs" style={{ borderTop: i === 0 ? '1px solid var(--color-border)' : 'none', paddingTop: i === 0 ? 12 : 4 }}>
                    <div style={{
                        background: isDark ? `${a.bg}33` : a.bg,
                        borderLeft: `3px solid ${a.border}`,
                        borderRadius: '0 8px 8px 0',
                        padding: '8px 12px',
                        fontSize: 12, color: a.title,
                        lineHeight: 1.65, fontStyle: 'italic',
                    }}>
                        {renderDomainContent(h, topic) || h}
                    </div>
                </div>
            ))}

            {/* ── Overview (lead + prose) ── */}
            {(core || prose) && (
                <div className="lv-cs">
                    <div className="lv-chip">Overview</div>
                    {core && (
                        <div style={{ fontSize: 13, color: 'var(--color-sec)', lineHeight: 1.7, marginBottom: prose ? 6 : 0 }}>
                            {renderDomainContent(core, topic) || core}
                        </div>
                    )}
                    {prose && (
                        <div style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.65 }}>
                            {renderDomainContent(prose, topic) || prose}
                        </div>
                    )}
                </div>
            )}

            {/* ── Key Concepts (tag cloud) ── */}
            {concepts.length > 0 && (
                <div className="lv-cs">
                    <div className="lv-chip">Concepts</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {concepts.map((c, i) => (
                            <span key={i} style={{
                                fontSize: 11, padding: '3px 9px',
                                background: isDark ? `${a.bg}44` : a.bg,
                                border: `1px solid ${a.border}`,
                                borderRadius: 6, color: a.title, fontWeight: 500,
                            }}>{renderDomainContent(c, topic) || c}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Key Distinctions ── */}
            {distinctions.length > 0 && (
                <div className="lv-cs">
                    <div className="lv-chip">Key Distinctions</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {distinctions.map((item, i) => (
                            <div key={i} style={{
                                fontSize: 12, color: 'var(--color-sec)', lineHeight: 1.6,
                                padding: '7px 10px',
                                background: 'var(--color-bg)',
                                border: '1px solid var(--color-border)', borderRadius: 8,
                            }}>
                                {renderDomainContent(item, topic) || item}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Exam Traps ── */}
            {traps.length > 0 && (
                <div className="lv-cs" style={{
                    background: isDark ? 'rgba(245,158,11,0.06)' : '#fffdf5',
                }}>
                    <div className="lv-chip lv-chip-amber">⚠ Exam Traps</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {traps.map((item, i) => (
                            <div key={i} style={{
                                fontSize: 12, color: isDark ? '#fcd34d' : '#78350f',
                                lineHeight: 1.6,
                                display: 'flex', alignItems: 'baseline', gap: 6,
                            }}>
                                <span style={{ flexShrink: 0, fontSize: 10 }}>•</span>
                                {renderDomainContent(item, topic) || item}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Examples ── */}
            {examples.length > 0 && (
                <div className="lv-cs">
                    <div className="lv-chip lv-chip-green">Examples</div>
                    {examples.map((e, i) => (
                        <div key={i} className="lv-ex-row">
                            <span className="lv-ex-arrow">→</span>
                            {renderDomainContent(e, topic) || e}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Key Definitions ── */}
            {definitions.length > 0 && (
                <div className="lv-cs">
                    <div className="lv-chip">Definitions</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {definitions.map((item, i) => (
                            <div key={i} style={{
                                fontSize: 12, color: 'var(--color-sec)', lineHeight: 1.6,
                                padding: '7px 10px',
                                background: 'var(--color-bg)',
                                border: '1px solid var(--color-border)', borderRadius: 8,
                            }}>
                                {renderDomainContent(typeof item === 'string' ? item : `${item.term || ''}: ${item.definition || ''}`, topic)}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Citations footer ── */}
            {section.citations?.length > 0 && (
                <div style={{
                    padding: '8px 16px',
                    borderTop: '1px solid var(--color-border)',
                    display: 'flex', gap: 5, flexWrap: 'wrap',
                }}>
                    {section.citations.map((cite, i) => (
                        <span key={i} style={{
                            fontSize: 10, color: 'var(--color-muted)',
                            fontFamily: "'JetBrains Mono', monospace",
                            background: 'var(--color-bg)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 999, padding: '2px 7px',
                        }}>{cite.label}</span>
                    ))}
                </div>
            )}
        </div>
    );
}

function ConceptNoteCard({ card, accent, index, total, topic }) {
    const isDark = useIsDark();
    const a = accent || ACCENTS_LIGHT[0];
    const definitions = Array.isArray(card?.key_definitions) ? card.key_definitions : [];
    const rawExamples = Array.isArray(card?.examples) ? card.examples : [];
    const examples = rawExamples
        .map(ex => {
            let text = String(ex || '').trim();
            text = text.replace(
                /^(words like|for example|let's say|okay|so|and|or|like|you know|i mean|right|well|maybe|even|things like|for instance|such as|say)[,\s]*/i,
                ''
            ).trim();
            return text;
        })
        .filter(ex => ex.split(/\s+/).length >= 4)
        .filter((ex, i, arr) => {
            const key = ex.toLowerCase().split(/\s+/).slice(0, 5).join(' ');
            return arr.findIndex(e =>
                e.toLowerCase().split(/\s+/).slice(0, 5).join(' ') === key
            ) === i;
        })
        .map(ex => ex.charAt(0).toUpperCase() + ex.slice(1))
        .slice(0, 4);
    const trap = card?.exam_trap || null;
    const distinction = card?.key_distinction || null;
    const analogy = card?.analogy || null;
    const remember = card?.remember || null;
    const mistake = card?.mistake || null;
    const sourceLabel = card?.source_start && card?.source_end
        ? `${card.source_start} – ${card.source_end}` : '';

    // Resolve distinction into left/right sides
    let distLeft = null, distRight = null, distLeftLabel = null, distRightLabel = null;
    if (distinction) {
        if (distinction.concept_a || distinction.concept_b) {
            const aSide = distinction.concept_a || {};
            const bSide = distinction.concept_b || {};
            distLeftLabel = aSide.name || 'A';
            distRightLabel = bSide.name || 'B';
            distLeft = (aSide.characteristics || []).join(' · ') || aSide.description || '';
            distRight = (bSide.characteristics || []).join(' · ') || bSide.description || '';
        } else if (typeof distinction === 'object') {
            const keys = Object.keys(distinction).filter(k => !['description', 'detail', 'note'].includes(k));
            if (keys.length >= 2) {
                distLeftLabel = keys[0].replace(/_/g, ' ');
                distRightLabel = keys[1].replace(/_/g, ' ');
                distLeft = String(distinction[keys[0]] || '');
                distRight = String(distinction[keys[1]] || '');
            }
        } else if (typeof distinction === 'string' && distinction.includes(' | ')) {
            const parts = distinction.split(' | ');
            const lm = parts[0].match(/^([^:]+):\s*(.+)$/);
            const rm = parts[1]?.match(/^([^:]+):\s*(.+)$/);
            if (lm && rm) {
                distLeftLabel = lm[1].trim();
                distRightLabel = rm[1].trim();
                distLeft = lm[2].trim();
                distRight = rm[2].trim();
            }
        }
    }

    // Resolve exam trap
    let trapMisconception = null, trapCorrect = null;
    if (trap) {
        if (typeof trap === 'object' && trap.misconception && trap.correct
            && trap.misconception.toLowerCase() !== trap.correct.toLowerCase()) {
            trapMisconception = trap.misconception;
            trapCorrect = trap.correct;
        } else if (typeof trap === 'string' && trap.trim()) {
            trapMisconception = trap.trim();
        }
    }

    return (
        <div className="lv-sum-card">

            {/* ── Header ── */}
            <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                {/* Accent dot */}
                <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: a.border, flexShrink: 0, marginTop: 4,
                    boxShadow: `0 0 0 3px ${isDark ? a.bg + '55' : a.bg}`,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: 14, fontWeight: 700, color: a.title,
                        letterSpacing: '-0.25px', lineHeight: 1.25,
                        marginBottom: card.summary ? 6 : 0,
                    }}>
                        {card.concept_name || ''}
                    </div>
                    {card.summary && (
                        <div style={{ fontSize: 13, color: 'var(--color-sec)', lineHeight: 1.65 }}>
                            {renderDomainContent(card.summary, topic) || card.summary}
                        </div>
                    )}
                </div>
                {total > 1 && (
                    <span style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 9, color: 'var(--color-muted)',
                        flexShrink: 0,
                        background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                        borderRadius: 6, padding: '2px 6px',
                    }}>{index + 1}/{total}</span>
                )}
            </div>

            {/* ── Key Distinction (VS grid) ── */}
            {distLeft && distRight && (
                <div className="lv-cs">
                    <div className="lv-chip">Key Distinction</div>
                    <div className="lv-vs-grid">
                        <div className="lv-vs-cell">
                            {distLeftLabel && <div className="lv-vs-label" style={{ color: a.title }}>{distLeftLabel}</div>}
                            {renderDomainContent(distLeft, topic) || distLeft}
                        </div>
                        <div className="lv-vs-badge">VS</div>
                        <div className="lv-vs-cell">
                            {distRightLabel && <div className="lv-vs-label" style={{ color: a.title }}>{distRightLabel}</div>}
                            {renderDomainContent(distRight, topic) || distRight}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Exam Trap ── */}
            {(trapMisconception || trapCorrect) && (
                <div className="lv-cs" style={{
                    background: isDark ? 'rgba(245,158,11,0.06)' : '#fffdf5',
                }}>
                    <div className="lv-chip lv-chip-amber">⚠ Exam Trap</div>
                    {trapMisconception && (
                        <div style={{
                            fontSize: 12, color: isDark ? '#fcd34d' : '#92400e',
                            fontWeight: 600, lineHeight: 1.6,
                            marginBottom: trapCorrect ? 6 : 0,
                            display: 'flex', alignItems: 'baseline', gap: 5,
                        }}>
                            <span style={{ flexShrink: 0 }}>✗</span>
                            {renderDomainContent(trapMisconception, topic) || trapMisconception}
                        </div>
                    )}
                    {trapCorrect && (
                        <div style={{
                            fontSize: 12, color: isDark ? '#6ee7b7' : '#065f46', lineHeight: 1.6,
                            display: 'flex', alignItems: 'baseline', gap: 5,
                        }}>
                            <span style={{ flexShrink: 0 }}>✓</span>
                            {renderDomainContent(trapCorrect, topic) || trapCorrect}
                        </div>
                    )}
                </div>
            )}

            {/* ── Analogy ── */}
            {analogy && (
                <div className="lv-cs" style={{
                    background: isDark ? 'rgba(16,185,129,0.05)' : '#f6fef9',
                }}>
                    <div className="lv-chip lv-chip-green">Real-World Analogy</div>
                    <div style={{ fontSize: 12, color: isDark ? '#a7f3d0' : '#166534',
                        lineHeight: 1.65, fontStyle: 'italic' }}>
                        {renderDomainContent(analogy, topic) || analogy}
                    </div>
                </div>
            )}

            {/* ── Examples ── */}
            {examples.length > 0 && (
                <div className="lv-cs">
                    <div className="lv-chip lv-chip-green">Professor's Examples</div>
                    {examples.map((item, i) => (
                        <div key={i} className="lv-ex-row">
                            <span className="lv-ex-arrow">→</span>
                            {renderDomainContent(item, topic) || item}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Key Definitions ── */}
            {definitions.length > 0 && (
                <div className="lv-cs">
                    <div className="lv-chip">Definitions</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {definitions.map((item, i) => (
                            <div key={i} style={{
                                fontSize: 12, color: 'var(--color-sec)', lineHeight: 1.6,
                                padding: '7px 10px',
                                background: 'var(--color-bg)',
                                border: '1px solid var(--color-border)', borderRadius: 8,
                            }}>
                                {item.term && (
                                    <span style={{ fontWeight: 600, color: 'var(--color-text)', marginRight: 4 }}>
                                        {renderDomainContent(item.term, topic) || item.term}:
                                    </span>
                                )}
                                {renderDomainContent(item.definition, topic) || item.definition}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Remember + Mistake ── */}
            {(remember || mistake) && (
                <div className="lv-cs">
                    <div className="lv-bottom-grid" style={{
                        gridTemplateColumns: remember && mistake ? '1fr 1fr' : '1fr',
                    }}>
                        {remember && (
                            <div className="lv-bottom-cell" style={{
                                background: isDark ? 'rgba(16,185,129,0.07)' : '#f0fdf4',
                                border: isDark ? '1px solid rgba(16,185,129,0.15)' : '1px solid #bbf7d0',
                            }}>
                                <div style={{
                                    fontSize: 9, fontWeight: 700, letterSpacing: '0.7px',
                                    textTransform: 'uppercase',
                                    color: isDark ? '#6ee7b7' : '#15803d',
                                    marginBottom: 5,
                                }}>Remember</div>
                                <div style={{ fontSize: 11, color: isDark ? '#a7f3d0' : '#166534', lineHeight: 1.6 }}>
                                    {renderDomainContent(remember, topic) || remember}
                                </div>
                            </div>
                        )}
                        {mistake && (
                            <div className="lv-bottom-cell" style={{
                                background: isDark ? 'rgba(245,158,11,0.06)' : '#fffbeb',
                                border: isDark ? '1px solid rgba(245,158,11,0.15)' : '1px solid #fde68a',
                            }}>
                                <div style={{
                                    fontSize: 9, fontWeight: 700, letterSpacing: '0.7px',
                                    textTransform: 'uppercase',
                                    color: isDark ? '#fbbf24' : '#b45309',
                                    marginBottom: 5,
                                }}>Common Mistake</div>
                                <div style={{ fontSize: 11, color: isDark ? '#fcd34d' : '#78350f', lineHeight: 1.6 }}>
                                    {renderDomainContent(mistake, topic) || mistake}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Footer: source timestamp ── */}
            {sourceLabel && (
                <div style={{
                    padding: '8px 16px',
                    borderTop: '1px solid var(--color-border)',
                    display: 'flex', alignItems: 'center', gap: 6,
                }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                        style={{ color: 'var(--color-muted)', flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span style={{ fontSize: 10, color: 'var(--color-muted)',
                        fontFamily: "'JetBrains Mono', monospace" }}>
                        {sourceLabel}
                    </span>
                </div>
            )}
        </div>
    );
}

const LANG_NAMES = { en: 'English', ar: 'Arabic', zh: 'Chinese', fr: 'French', de: 'German', hi: 'Hindi', es: 'Spanish', it: 'Italian', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese', ru: 'Russian' };

function fmtDur(s) {
    if (!s) return '—';
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

// ─── Share Modal ──────────────────────────────────────────────────────────────
const EXPIRY_OPTIONS = [
    { label: 'Never', value: null },
    { label: '1 day', value: 1 },
    { label: '7 days', value: 7 },
    { label: '30 days', value: 30 },
];

function ShareModal({ lectureId, initialToken, onClose, addToast }) {
    const [mode, setMode]           = useState('full');
    const [expiryDays, setExpiryDays] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [shareUrl, setShareUrl]   = useState(
        initialToken ? window.location.origin + '/share/' + initialToken : ''
    );
    const [revoking, setRevoking]   = useState(false);

    const expiryIso = expiryDays
        ? new Date(Date.now() + expiryDays * 86400000).toISOString()
        : null;

    async function generate() {
        setGenerating(true);
        try {
            const res = await (await import('../lib/api')).default.post(
                `/api/v1/lectures/${lectureId}/share`,
                { mode, expires_at: expiryIso }
            );
            const url = window.location.origin + res.data.share_url;
            setShareUrl(url);
        } catch {
            addToast({ type: 'error', message: 'Failed to generate share link' });
        } finally {
            setGenerating(false);
        }
    }

    async function copyLink() {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            addToast({ type: 'success', message: 'Link copied!' });
        } catch {
            addToast({ type: 'success', message: shareUrl });
        }
    }

    async function revoke() {
        setRevoking(true);
        try {
            await (await import('../lib/api')).default.post(`/api/v1/lectures/${lectureId}/unshare`);
            setShareUrl('');
            addToast({ type: 'success', message: 'Share link revoked' });
        } catch {
            addToast({ type: 'error', message: 'Failed to revoke' });
        } finally {
            setRevoking(false);
        }
    }

    return (
        <div className="lv-share-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="lv-share-box">

                {/* Header */}
                <div className="lv-share-header">
                    <div className="lv-share-header-icon">
                        <Share2 size={16} />
                    </div>
                    <div className="lv-share-title">Share lecture</div>
                    <button className="lv-share-close" onClick={onClose} aria-label="Close">
                        <X size={14} strokeWidth={2.5} />
                    </button>
                </div>

                <div className="lv-share-body">
                    {/* Content mode */}
                    <div className="lv-share-section">
                        <div className="lv-share-label">Content</div>
                        <div className="lv-share-toggle">
                            <button className={`lv-share-opt${mode === 'full' ? ' active' : ''}`} onClick={() => setMode('full')}>Full</button>
                            <button className={`lv-share-opt${mode === 'summary_only' ? ' active' : ''}`} onClick={() => setMode('summary_only')}>Summary only</button>
                        </div>
                        <div className="lv-share-mode-note">
                            {mode === 'summary_only'
                                ? 'Viewers see notes and concepts — transcript is hidden.'
                                : 'Viewers can read the full transcript and summary.'}
                        </div>
                    </div>

                    {/* Expiry */}
                    <div className="lv-share-section">
                        <div className="lv-share-label">Link expiry</div>
                        <div className="lv-share-expiry">
                            {EXPIRY_OPTIONS.map(opt => (
                                <button key={opt.label}
                                    className={`lv-share-exp-btn${expiryDays === opt.value ? ' active' : ''}`}
                                    onClick={() => setExpiryDays(opt.value)}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Generate */}
                    <button className="lv-share-gen" onClick={generate} disabled={generating}>
                        {generating
                            ? <span style={{ opacity: 0.7 }}>Generating…</span>
                            : shareUrl ? 'Update link' : 'Generate link'
                        }
                    </button>

                    {/* URL + copy + QR */}
                    {shareUrl && (
                        <>
                            <div className="lv-share-section">
                                <div className="lv-share-label">Shareable link</div>
                                <div className="lv-share-url-box">
                                    <div className="lv-share-url" title={shareUrl}>{shareUrl}</div>
                                    <button className="lv-share-copy" onClick={copyLink}>
                                        <Copy size={11} />
                                        Copy
                                    </button>
                                </div>
                            </div>
                            <div className="lv-share-qr">
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=148x148&data=${encodeURIComponent(shareUrl)}&bgcolor=ffffff&color=1a1a1a&margin=8`}
                                    alt="QR code"
                                    width={148}
                                    height={148}
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Footer with revoke */}
                {shareUrl && (
                    <div className="lv-share-footer">
                        <button className="lv-share-revoke" onClick={revoke} disabled={revoking}>
                            {revoking ? 'Revoking…' : 'Revoke link'}
                        </button>
                        <span className="lv-share-expiry-note">
                            {expiryDays ? `Expires in ${expiryDays}d` : 'No expiry set'}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

const KNOWN_TOPICS = [
    'medicine','law','physics','computer science','history','mathematics',
    'economics','literature','chemistry','biology','psychology','philosophy',
    'engineering','business','linguistics','political science','sociology',
    'art','music','architecture',
];

// ─── Main component ───────────────────────────────────────────────────────────
export default function LectureView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const addToast = useToast();
    const isDark = useIsDark();
    const creditsApi = useCreditsApi();

    const [lecture, setLecture]         = useState(null);
    const [creditsInfo, setCreditsInfo] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    useSEO({ title: lecture?.title || 'Lecture', noindex: true });
    const [summaryStatus, setSummaryStatus] = useState('live');
    const [loading, setLoading]         = useState(true);
    const [exportOpen, setExportOpen]   = useState(false);
    const [exportInProgress, setExportInProgress] = useState(false);
    const [shareOpen, setShareOpen]     = useState(false);
    const [activeTab, setActiveTab]     = useState('summary');
    const [qaHistory, setQaHistory]     = useState([]);
    const [qaQuestion, setQaQuestion]   = useState('');
    const [qaLoading, setQaLoading]     = useState(false);
    const [stats, setStats]             = useState(null);
    const [visualFrames, setVisualFrames] = useState(null); // null = not fetched
    const qaEndRef = useRef(null);
    const [selInfo, setSelInfo]           = useState({ text: '', x: 0, y: 0, show: false });
    const [explainPanel, setExplainPanel] = useState({ show: false, loading: false, data: null });
    const transcriptRef = useRef(null);
    const [mobileSplit, setMobileSplit] = useState(55);
    const [isMobile, setIsMobile]       = useState(() => window.innerWidth < 768);
    const [topicEditing, setTopicEditing] = useState(false);
    const [topicDraft, setTopicDraft]     = useState('');
    const [topicSaving, setTopicSaving]   = useState(false);
    const [fcIdx, setFcIdx]         = useState(0);
    const [fcFlipped, setFcFlipped] = useState(false);
    const [quizAnswers, setQuizAnswers] = useState({});
    const [transcriptSearch, setTranscriptSearch] = useState('');
    const [cardSearch, setCardSearch] = useState('');
    const [glossarySearch, setGlossarySearch] = useState('');
    const bodyRef = useRef(null);
    const dragHandleRef = React.useRef(null);
    const dragCleanupRef = React.useRef(null);
    const onHandleDragRef = React.useRef(null);
    const [showFeedbackCard, setShowFeedbackCard] = useState(false);
    const feedbackTimerRef = useRef(null);

    // ── Study Tools state ─────────────────────────────────────────────────────
    // Exam Prep
    const [examPrep, setExamPrep]           = useState(null);  // null = not loaded
    const [examLoading, setExamLoading]     = useState(false);
    const [examFilter, setExamFilter]       = useState('all'); // all | easy | medium | hard
    const [examRevealed, setExamRevealed]   = useState({});    // { idx: true }

    // Concept Map

    // Quiz Practice Mode
    const [practiceMode, setPracticeMode]   = useState(false);
    const [practiceIdx, setPracticeIdx]     = useState(0);
    const [practiceAnswers, setPracticeAnswers] = useState({});
    const [practiceTimer, setPracticeTimer] = useState(0);
    const [practiceDone, setPracticeDone]   = useState(false);
    const [practiceSaving, setPracticeSaving] = useState(false);
    const practiceTimerRef = useRef(null);

    // Past Attempts
    const [pastAttempts, setPastAttempts]   = useState(null);  // null = not fetched
    const [pastOpen, setPastOpen]           = useState(false);
    const [pastLoading, setPastLoading]     = useState(false);

    // Post-lecture rating prompt
    const [ratingValue, setRatingValue]     = useState(0);
    const [ratingHover, setRatingHover]     = useState(0);
    const [ratingMsg, setRatingMsg]         = useState('');
    const [ratingSent, setRatingSent]       = useState(false);
    const [ratingDismissed, setRatingDismissed] = useState(
        () => !!localStorage.getItem(`feedback_rated_${id}`)
    );

    useEffect(() => { trackPageview('lecture'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        api.get(`/api/v1/lectures/${id}/full?t=${Date.now()}`)
            .then(res => {
                setLecture(res.data);
                setSummaryStatus(res.data.summary_status || 'live');
                const status = res.data?.summary_status;
                setIsProcessing(status && !['final', 'done'].includes(status));
            })
            .catch(() => navigate('/app'))
            .finally(() => setLoading(false));
        creditsApi.getBalance().then(res => setCreditsInfo(res.data)).catch(() => {});
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Poll every 3s while lecture processing/refinement is still in progress.
    useEffect(() => {
        if (!isProcessing && summaryStatus !== 'recomputing') return;
        const interval = setInterval(() => {
            api.get(`/api/v1/lectures/${id}/full?t=${Date.now()}`)
                .then(res => {
                    const nextStatus = res.data.summary_status || 'live';
                    setLecture(res.data);
                    setSummaryStatus(nextStatus);
                    setIsProcessing(nextStatus && !['final', 'done'].includes(nextStatus));
                })
                .catch(() => {});
        }, 3000);
        return () => clearInterval(interval);
    }, [summaryStatus, isProcessing, id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (activeTab === 'stats' && id && !stats) {
            api.get(`/api/v1/lectures/${id}/analytics`)
                .then(res => setStats(res.data))
                .catch(() => {});
        }
        if (activeTab === 'stats' && id && visualFrames === null) {
            api.get(`/api/v1/lectures/${id}/visual-frames`)
                .then(res => setVisualFrames(res.data.frames || []))
                .catch(() => setVisualFrames([]));
        }
        if (activeTab === 'exam' && id && examPrep === null && !examLoading) {
            setExamLoading(true);
            api.get(`/api/v1/lectures/${id}/exam-prep`)
                .then(res => setExamPrep(res.data.questions || []))
                .catch(err => {
                    if (err?.response?.status === 403) setExamPrep('locked');
                    else setExamPrep([]);
                })
                .finally(() => setExamLoading(false));
        }
    }, [activeTab, id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Practice timer
    useEffect(() => {
        if (practiceMode && !practiceDone) {
            practiceTimerRef.current = setInterval(() => setPracticeTimer(t => t + 1), 1000);
        } else {
            clearInterval(practiceTimerRef.current);
        }
        return () => clearInterval(practiceTimerRef.current);
    }, [practiceMode, practiceDone]);

    useEffect(() => {
        if (qaEndRef.current) qaEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [qaHistory, qaLoading]);

    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    // Register touchstart with { passive: false } so e.preventDefault() works
    useEffect(() => {
        const el = dragHandleRef.current;
        if (!el) return;
        const handler = (e) => onHandleDragRef.current(e);
        el.addEventListener('touchstart', handler, { passive: false });
        return () => el.removeEventListener('touchstart', handler);
    }, []); // only on mount

    // Clean up any in-progress drag listeners if component unmounts mid-drag
    useEffect(() => {
        return () => {
            if (dragCleanupRef.current) dragCleanupRef.current();
        };
    }, []);

    useEffect(() => {
        if (!topicEditing) return;
        function handleClick(e) {
            if (!e.target.closest('.lv-topic-wrap')) setTopicEditing(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [topicEditing]);

    // Beta feedback card: show after 30s if user is beta-active and hasn't submitted yet
    useEffect(() => {
        if (!id) return;
        if (localStorage.getItem('fbk_' + id)) return;
        // Check if user is a beta tester
        api.get('/api/v1/profile').then(res => {
            if (res.data?.beta_active) {
                feedbackTimerRef.current = setTimeout(() => {
                    if (!localStorage.getItem('fbk_' + id)) {
                        setShowFeedbackCard(true);
                    }
                }, 30000);
            }
        }).catch(() => {});
        return () => { if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current); };
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    async function saveTopic(newTopic) {
        const trimmed = (newTopic || '').trim();
        if (!trimmed || trimmed === lecture?.topic) { setTopicEditing(false); return; }
        newTopic = trimmed;
        setTopicSaving(true);
        try {
            const { updateLectureTopic } = await import('../lib/api.js');
            await updateLectureTopic(lecture.id, newTopic);
            setLecture(l => ({ ...l, topic: newTopic }));
        } catch {
            // silent fail — badge reverts to original
        } finally {
            setTopicSaving(false);
            setTopicEditing(false);
        }
    }

    const handleAsk = async (overrideQ) => {
        const q = (overrideQ ?? qaQuestion).trim();
        if (!q || qaLoading) return;
        setQaQuestion('');
        setQaHistory(h => [...h, { role: 'user', text: q }]);
        setQaLoading(true);
        try {
            const res = await api.post(`/api/v1/ask/${id}`, {
                question: q,
                history: qaHistory.slice(-6).map(m => ({
                    role: m.role === 'user' ? 'user' : 'assistant',
                    content: m.text,
                })),
            });
            setQaHistory(h => [...h, { role: 'assistant', text: res.data.answer, follow_ups: res.data.follow_ups || [] }]);
        } catch {
            setQaHistory(h => [...h, { role: 'assistant', text: 'Failed to get answer. Please try again.', follow_ups: [] }]);
        }
        setQaLoading(false);
    };

    const handleTextSelection = () => {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : '';
        if (text.length >= 6) {
            const rect = sel.getRangeAt(0).getBoundingClientRect();
            setSelInfo({ text, x: rect.left + rect.width / 2, y: rect.top - 10, show: true });
        } else {
            setSelInfo(s => ({ ...s, show: false }));
        }
    };

    const handleExplain = async () => {
        if (!selInfo.text) return;
        setSelInfo(s => ({ ...s, show: false }));
        setExplainPanel({ show: true, loading: true, data: null });
        try {
            const res = await api.post(`/api/v1/explain/${id}`, { text: selInfo.text, mode: 'simple' });
            setExplainPanel({ show: true, loading: false, data: res.data });
        } catch {
            setExplainPanel({ show: true, loading: false, data: { explanation: 'Could not generate explanation. Please try again.' } });
        }
    };

    const onHandleDrag = (e) => {
        e.preventDefault();
        const bodyRect = bodyRef.current?.getBoundingClientRect();
        if (!bodyRect) return;
        const onMove = (ev) => {
            const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
            const pct = ((y - bodyRect.top) / bodyRect.height) * 100;
            setMobileSplit(Math.min(80, Math.max(20, Math.round(pct))));
        };
        const cleanup = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchend', onUp);
        };
        const onUp = () => {
            cleanup();
            dragCleanupRef.current = null;
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
        dragCleanupRef.current = cleanup;
    };
    onHandleDragRef.current = onHandleDrag;

    // Split transcript into readable segments.
    // Live recordings: already newline-separated 12-second chunks → keep as-is.
    // Imported recordings: arrive as one big paragraph → split into sentence groups.
    const { segments, isSentenceSplit } = (() => {
        const raw = lecture?.transcript || '';
        if (!raw) return { segments: [], isSentenceSplit: false };
        const lines = raw.split('\n').filter(s => s.trim());
        if (lines.length > 2) return { segments: lines, isSentenceSplit: false };
        // Single blob — split on sentence boundaries, group 3 per chunk
        const sentences = raw.match(/[^.!?]+(?:[.!?]+(?:\s|$)|\s*$)/g) || [raw];
        const chunks = [];
        for (let i = 0; i < sentences.length; i += 3) {
            const chunk = sentences.slice(i, i + 3).join(' ').trim();
            if (chunk) chunks.push(chunk);
        }
        return { segments: chunks.length > 0 ? chunks : lines, isSentenceSplit: true };
    })();

    const wordCount = lecture?.transcript_word_count || segments.reduce((n, s) => n + s.split(/\s+/).filter(Boolean).length, 0);
    const summaryText = lecture?.master_summary || lecture?.summary || '';
    const conceptNoteCards = Array.isArray(lecture?.concept_note_cards)
        ? lecture.concept_note_cards.filter(card => {
            const name = typeof card?.concept_name === 'string' ? card.concept_name : '';
            return !name.startsWith('__');
        })
        : [];
    const conceptSections = Array.isArray(lecture?.concept_sections) ? lecture.concept_sections : [];
    const groundedSections = Array.isArray(lecture?.grounded_notes) ? lecture.grounded_notes : [];
    const summarySections = conceptSections.length > 0 ? conceptSections : (groundedSections.length > 0 ? groundedSections : parseSummary(summaryText));
    const aiStudyAids = lecture?.ai_study_aids?.items || [];
    const topicCount = conceptNoteCards.length || summarySections.reduce((n, s) => n + (s.concepts || []).length, 0);
    const titleDisplay = lecture?.title
        ? (lecture.title.length > 40 ? lecture.title.slice(0, 40) + '…' : lecture.title)
        : 'Lecture';

    const TABS = [
        { id: 'summary',    label: 'Notes',  icon: <FileText       size={13} /> },
        { id: 'ask',        label: 'Ask',    icon: <MessageCircle  size={13} /> },
        { id: 'flashcards', label: 'Cards',  icon: <CreditCard     size={13} /> },
        { id: 'quiz',       label: 'Quiz',   icon: <HelpCircle     size={13} /> },
        { id: 'exam',       label: 'Exam',   icon: <GraduationCap  size={13} /> },
        { id: 'glossary',   label: 'Terms',  icon: <BookOpen       size={13} /> },
        { id: 'stats',      label: 'Stats',  icon: <BarChart2      size={13} /> },
    ];

    const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

    const startPractice = () => {
        setPracticeIdx(0);
        setPracticeAnswers({});
        setPracticeTimer(0);
        setPracticeDone(false);
        setPracticeMode(true);
    };

    const handlePracticeAnswer = async (qi, letter, questions) => {
        const next = { ...practiceAnswers, [qi]: letter };
        setPracticeAnswers(next);
        if (Object.keys(next).length === questions.length) {
            setPracticeDone(true);
            // compute score
            const score = questions.reduce((acc, q, i) => {
                const correctLetter = (q.answer || '').charAt(0).toUpperCase();
                return acc + (next[i] === correctLetter ? 1 : 0);
            }, 0);
            // save attempt
            setPracticeSaving(true);
            try {
                await api.post(`/api/v1/lectures/${id}/quiz-attempts`, {
                    score,
                    total: questions.length,
                    duration_seconds: practiceTimer,
                    answers_json: next,
                });
                // reset past attempts cache so it refreshes
                setPastAttempts(null);
            } catch { /* silent */ }
            setPracticeSaving(false);
        } else {
            setPracticeIdx(qi + 1);
        }
    };

    const loadPastAttempts = async () => {
        if (pastAttempts !== null) { setPastOpen(o => !o); return; }
        setPastOpen(true);
        setPastLoading(true);
        try {
            const res = await api.get(`/api/v1/lectures/${id}/quiz-attempts`);
            setPastAttempts(res.data.attempts || []);
        } catch {
            setPastAttempts([]);
        }
        setPastLoading(false);
    };

    if (loading) {
        return (
            <>
                <style>{CSS}</style>
                <div className="lv"><div className="lv-loading">Loading…</div></div>
            </>
        );
    }

    return (
        <>
            <style>{CSS}</style>
            <div className="lv">
                {/* ── Navbar ── */}
                <nav className="lv-nav">
                    <Link to="/app" className="lv-back">
                        <ArrowLeft size={14} />
                        Back
                    </Link>
                    <div className="lv-nav-title">{titleDisplay}</div>
                    <div className="lv-nav-right">
                        {creditsInfo !== null && (() => {
                            const subActive = creditsInfo.credits_sub_status === 'monthly'
                                && creditsInfo.credits_sub_expires
                                && new Date(creditsInfo.credits_sub_expires) > new Date();
                            const cls = subActive ? 'sub' : creditsInfo.low_credits ? 'low' : '';
                            return (
                                <Link to="/credits" className={`lv-credits-chip${cls ? ' ' + cls : ''}`} title={subActive ? `Monthly subscription · expires ${new Date(creditsInfo.credits_sub_expires).toLocaleDateString()}` : `${creditsInfo.credits} credit${creditsInfo.credits !== 1 ? 's' : ''} remaining`}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                    {subActive ? '∞ sub' : `${creditsInfo.credits} cr${creditsInfo.low_credits ? ' ⚠' : ''}`}
                                </Link>
                            );
                        })()}
                        <button
                            className="lv-btn-ghost"
                            onClick={() => {
                                setExportInProgress(true);
                                setExportOpen(true);
                            }}
                            disabled={exportInProgress}
                        >
                            <Download size={12} />
                            <span className="lv-btn-text">Export PDF</span>
                        </button>
                        <button className="lv-btn-ghost" onClick={() => setShareOpen(true)}>
                            <Share2 size={12} />
                            <span className="lv-btn-text">Share</span>
                        </button>
                    </div>
                </nav>

                {/* ── Job progress bar ── */}
                {isProcessing && (
                    <div style={{ padding: '16px 20px 0' }}>
                        <JobProgress
                            lectureId={lecture?.id}
                            onDone={() => {
                                setIsProcessing(false);
                                // Refresh lecture data
                                api.get(`/api/v1/lectures/${lecture.id}/full`).then(r => setLecture(r.data)).catch(() => {});
                            }}
                        />
                    </div>
                )}

                {/* ── Deletion warning banner ── */}
                {lecture?.deletion_scheduled_at && !lecture?.content_deleted && (
                    <div style={{
                        background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8,
                        padding: '10px 16px', fontSize: 13, color: '#92400e', marginBottom: 12,
                        marginLeft: 20, marginRight: 20, marginTop: 12
                    }}>
                        ⚠ Your free plan content is scheduled for deletion on{' '}
                        <strong>{new Date(lecture.deletion_scheduled_at).toLocaleDateString()}</strong>.{' '}
                        <a href="/credits" style={{ color: '#92400e', fontWeight: 600, textDecoration: 'underline' }}>Upgrade to save it.</a>
                    </div>
                )}

                {/* ── Two-panel body ── */}
                <div className="lv-body" ref={bodyRef}>
                    {/* Left: transcript */}
                    <div className="lv-left" ref={transcriptRef} onMouseUp={handleTextSelection}
                        style={isMobile ? { height: `${mobileSplit}vh` } : {}}>
                        <div className="lv-panel-header">
                            <span className="lv-panel-label">Transcript</span>
                            <span className="lv-panel-meta">{wordCount.toLocaleString()} words</span>
                            {lecture?.topic && (
                                <div className="lv-topic-wrap">
                                    <span
                                        className="lv-pill lv-pill-topic"
                                        style={{ cursor: 'pointer', userSelect: 'none' }}
                                        title="Click to change domain"
                                        onClick={() => { setTopicDraft(''); setTopicEditing(e => !e); }}
                                    >
                                        {topicSaving ? '…' : lecture.topic}
                                    </span>
                                    {topicEditing && (
                                        <div className="lv-topic-dropdown">
                                            {KNOWN_TOPICS.map(t => (
                                                <div
                                                    key={t}
                                                    className={`lv-topic-option${lecture.topic === t ? ' selected' : ''}`}
                                                    onClick={() => saveTopic(t)}
                                                >
                                                    {t}
                                                </div>
                                            ))}
                                            <input
                                                className="lv-topic-custom"
                                                placeholder="Custom field…"
                                                value={topicDraft}
                                                onChange={e => setTopicDraft(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') saveTopic(topicDraft); }}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                            {lecture?.language && <span className="lv-pill lv-pill-lang">{LANG_NAMES[lecture.language] || lecture.language.toUpperCase()}</span>}
                        </div>
                        {segments.length > 4 && (
                            <div className="lv-transcript-search">
                                <input
                                    className="lv-search-input"
                                    type="search"
                                    placeholder="Search transcript…"
                                    value={transcriptSearch}
                                    onChange={e => setTranscriptSearch(e.target.value)}
                                />
                            </div>
                        )}
                        {segments.length === 0
                            ? <div className="lv-empty-panel">No transcript available</div>
                            : (() => {
                                const q = transcriptSearch.trim().toLowerCase();
                                const filtered = q
                                    ? segments.map((text, i) => ({ text, i })).filter(({ text }) => text.toLowerCase().includes(q))
                                    : segments.map((text, i) => ({ text, i }));
                                if (q && filtered.length === 0) {
                                    return <div className="lv-empty-panel">No matches</div>;
                                }
                                return (
                                    <div className="lv-transcript-list">
                                        {filtered.map(({ text, i }) => {
                                            const isLast = i === segments.length - 1;
                                            let display;
                                            if (q) {
                                                const idx = text.toLowerCase().indexOf(q);
                                                display = (
                                                    <span className="lv-seg-text">
                                                        {text.slice(0, idx)}
                                                        <mark className="lv-seg-highlight">{text.slice(idx, idx + q.length)}</mark>
                                                        {text.slice(idx + q.length)}
                                                    </span>
                                                );
                                            } else {
                                                display = <span className="lv-seg-text">{text}</span>;
                                            }
                                            return (
                                                <div key={i} className={`lv-segment lv-chunk-enter${isLast && !q ? ' lv-seg-live' : ''}`}>
                                                    <span className="lv-seg-num">
                                                        {isSentenceSplit
                                                            ? <span style={{ opacity: 0.5 }}>{String(i + 1).padStart(2, '0')}</span>
                                                            : <>{fmtTs(i * 12)}<br /><span style={{ opacity: 0.6 }}>–{fmtTs((i + 1) * 12)}</span></>
                                                        }
                                                    </span>
                                                    {display}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()
                        }
                    </div>

                    {/* Drag handle — mobile only */}
                    <div
                        className="lv-drag-handle"
                        ref={dragHandleRef}
                        onMouseDown={onHandleDrag}
                    >
                        <div className="lv-drag-pill" />
                    </div>

                    {/* Right: tabbed panel */}
                    <div className="lv-right">
                        <div className="lv-tabs">
                            {TABS.map(tab => (
                                <button
                                    key={tab.id}
                                    className={`lv-tab${activeTab === tab.id ? ' active' : ''}`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    <span className="lv-tab-icon">{tab.icon}</span>
                                    <span className="lv-tab-label">
                                        {tab.label}
                                        {tab.id === 'summary' && summaryStatus === 'recomputing' && (
                                            <span style={{ fontSize: 10, color: 'var(--color-muted)', fontStyle: 'italic', fontWeight: 400, marginLeft: 4 }}>·</span>
                                        )}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Notes (Summary) */}
                        {activeTab === 'summary' && (
                            <div className="lv-tab-body">
                                {conceptNoteCards.length > 3 && (
                                    <input
                                        className="lv-search-input"
                                        type="search"
                                        placeholder="Filter concepts…"
                                        value={cardSearch}
                                        onChange={e => setCardSearch(e.target.value)}
                                        style={{ marginBottom: 14 }}
                                    />
                                )}
                                {(conceptNoteCards.length === 0 && summarySections.length === 0)
                                    ? <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', paddingTop: 40 }}>
                                        {isProcessing || summaryStatus === 'recomputing'
                                            ? 'Summary is still being prepared'
                                            : 'Summary not yet generated'}
                                    </div>
                                    : (() => {
                                        const q = cardSearch.trim().toLowerCase();
                                        const palette = isDark ? ACCENTS_DARK : ACCENTS_LIGHT;
                                        if (conceptNoteCards.length > 0) {
                                            const filtered = q
                                                ? conceptNoteCards.filter(c => (c.concept_name || '').toLowerCase().includes(q) || (c.summary || '').toLowerCase().includes(q))
                                                : conceptNoteCards;
                                            return (
                                                <>
                                                    {filtered.length === 0
                                                        ? <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', paddingTop: 24 }}>No concepts match</div>
                                                        : filtered.map((card, i) => (
                                                            <ConceptNoteCard key={i} card={card} accent={palette[i % palette.length]} index={i} total={filtered.length} topic={lecture?.topic} />
                                                        ))
                                                    }
                                                    {aiStudyAids.length > 0 && (
                                                        <div className="lv-aid-panel">
                                                            <div className="lv-aid-title">AI Study Aids</div>
                                                            <div className="lv-aid-copy">Generated practice tools are kept separate from grounded notes.</div>
                                                            <div className="lv-aid-chips">
                                                                {aiStudyAids.map((item, i) => (
                                                                    <span key={i} className="lv-aid-chip">{item.label} {item.count ? `· ${item.count}` : ''}</span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        }
                                        return (
                                            <>
                                                {summarySections.map((s, i) => (
                                                    <SummaryCard key={i} section={s} accent={palette[i % palette.length]} index={i} total={summarySections.length} topic={lecture?.topic} />
                                                ))}
                                                {aiStudyAids.length > 0 && (
                                                    <div className="lv-aid-panel">
                                                        <div className="lv-aid-title">AI Study Aids</div>
                                                        <div className="lv-aid-copy">Generated practice tools are kept separate from grounded notes.</div>
                                                        <div className="lv-aid-chips">
                                                            {aiStudyAids.map((item, i) => (
                                                                <span key={i} className="lv-aid-chip">{item.label} {item.count ? `· ${item.count}` : ''}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()
                                }

                                {/* Post-lecture rating prompt — shown once per lecture after content loads */}
                                {!ratingDismissed && !isProcessing && summaryStatus === 'final' &&
                                 (conceptNoteCards.length > 0 || summarySections.length > 0) && (
                                    <div className="lv-rate-card">
                                        {ratingSent ? (
                                            <div className="lv-rate-thanks">
                                                <div className="lv-rate-thanks-icon">✓</div>
                                                <span>Thanks! Your feedback helps us improve note quality.</span>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="lv-rate-title">How were these notes?</div>
                                                <div className="lv-rate-sub">Rate the quality of the AI-generated summary</div>
                                                <div className="lv-rate-stars">
                                                    {[1,2,3,4,5].map(n => (
                                                        <button
                                                            key={n}
                                                            className={`lv-rate-star${ratingValue >= n ? ' active' : ''}${ratingHover >= n && ratingHover > 0 ? ' hover' : ''}`}
                                                            onMouseEnter={() => setRatingHover(n)}
                                                            onMouseLeave={() => setRatingHover(0)}
                                                            onClick={() => setRatingValue(n)}
                                                            aria-label={`${n} star${n > 1 ? 's' : ''}`}
                                                        >
                                                            ★
                                                        </button>
                                                    ))}
                                                </div>
                                                {ratingValue > 0 && (
                                                    <textarea
                                                        className="lv-rate-textarea"
                                                        rows={2}
                                                        maxLength={500}
                                                        placeholder={ratingValue >= 4 ? 'What did you like? (optional)' : 'What could be better? (optional)'}
                                                        value={ratingMsg}
                                                        onChange={e => setRatingMsg(e.target.value)}
                                                    />
                                                )}
                                                <div className="lv-rate-actions">
                                                    <button className="lv-rate-skip" onClick={() => {
                                                        localStorage.setItem(`feedback_rated_${id}`, '1');
                                                        setRatingDismissed(true);
                                                    }}>
                                                        Skip
                                                    </button>
                                                    <button
                                                        className="lv-rate-submit"
                                                        disabled={ratingValue === 0}
                                                        onClick={async () => {
                                                            localStorage.setItem(`feedback_rated_${id}`, '1');
                                                            try {
                                                                await api.post('/api/v1/feedback', {
                                                                    type: 'general',
                                                                    message: ratingMsg.trim() || `${ratingValue}-star rating`,
                                                                    page_path: window.location.pathname,
                                                                    lecture_id: id,
                                                                    rating: ratingValue,
                                                                });
                                                            } catch { /* silent */ }
                                                            setRatingSent(true);
                                                            setTimeout(() => setRatingDismissed(true), 2500);
                                                        }}
                                                    >
                                                        Submit
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Ask */}
                        {activeTab === 'ask' && (
                            <>
                                <div className="lv-tab-body">
                                    {qaHistory.length === 0 && !qaLoading && (
                                        <div className="lv-qa-empty">
                                            <div className="lv-qa-empty-icon">
                                                <MessageCircle size={20} strokeWidth={1.5} />
                                            </div>
                                            <div>
                                                <div className="lv-qa-empty-text">Ask about this lecture</div>
                                                <div className="lv-qa-empty-sub">Grounded in your own transcript</div>
                                            </div>
                                            <div className="lv-qa-chips">
                                                {['What are the key concepts?', 'Summarise in 3 points', 'What was the main argument?'].map(q => (
                                                    <button key={q} className="lv-qa-chip" onClick={() => { setQaQuestion(q); }}>
                                                        {q}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="lv-qa-messages">
                                        {qaHistory.map((m, i) => (
                                            <div key={i}>
                                                <div className={`lv-qa-msg ${m.role === 'user' ? 'lv-qa-user' : 'lv-qa-assistant'}`}>
                                                    {m.role === 'assistant'
                                                        ? <QAAnswer dark={isDark} text={m.text} topic={lecture?.topic} />
                                                        : m.text
                                                    }
                                                </div>
                                                {m.role === 'assistant' && (
                                                    <>
                                                        <div className="lv-qa-src">
                                                            <Shield size={9} />
                                                            Grounded in your transcript
                                                        </div>
                                                        {m.follow_ups && m.follow_ups.length > 0 && (
                                                            <div className="lv-followup-chips">
                                                                {m.follow_ups.map((fq, fi) => (
                                                                    <button
                                                                        key={fi}
                                                                        className="lv-followup-chip"
                                                                        onClick={() => handleAsk(fq)}
                                                                    >
                                                                        {fq}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                        {qaLoading && (
                                            <div className="lv-qa-typing">
                                                <div className="lv-qa-dot" />
                                                <div className="lv-qa-dot" />
                                                <div className="lv-qa-dot" />
                                            </div>
                                        )}
                                        <div ref={qaEndRef} />
                                    </div>
                                </div>
                                <div className="lv-qa-bar">
                                    <input
                                        className="lv-qa-input"
                                        type="text"
                                        value={qaQuestion}
                                        onChange={e => setQaQuestion(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAsk()}
                                        placeholder="Ask anything about this lecture…"
                                        disabled={qaLoading}
                                    />
                                    <button className="lv-qa-send" onClick={handleAsk} disabled={qaLoading || !qaQuestion.trim()} aria-label="Send">
                                        <Send size={15} />
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Stats */}
                        {activeTab === 'stats' && (
                            <div className="lv-tab-body">
                                {!stats
                                    ? <div style={{ fontSize: 13, color: C.muted }}>Loading…</div>
                                    : (
                                        <div className="lv-stat-grid">
                                            {/* Duration — full width hero */}
                                            <div className="lv-stat-card lv-stat-full" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                                <div className="lv-stat-icon" style={{ marginBottom: 0 }}>
                                                    <Clock size={14} />
                                                </div>
                                                <div>
                                                    <div className="lv-stat-label">Duration</div>
                                                    <div className="lv-stat-val" style={{ fontSize: 26 }}>{fmtDur(stats.total_duration_seconds)}</div>
                                                </div>
                                                {stats.word_count > 0 && (
                                                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                                                        <div className="lv-stat-label">Words</div>
                                                        <div className="lv-stat-val">{(stats.word_count || 0).toLocaleString()}</div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Chunks */}
                                            <div className="lv-stat-card">
                                                <div className="lv-stat-icon">
                                                    <AlignLeft size={13} />
                                                </div>
                                                <div className="lv-stat-label">Chunks</div>
                                                <div className="lv-stat-val">{stats.total_chunks || 0}</div>
                                                <div className="lv-stat-sub">12s segments</div>
                                            </div>

                                            {/* Sections */}
                                            <div className="lv-stat-card">
                                                <div className="lv-stat-icon">
                                                    <FileText size={13} />
                                                </div>
                                                <div className="lv-stat-label">Sections</div>
                                                <div className="lv-stat-val">{summarySections.length || '—'}</div>
                                                <div className="lv-stat-sub">summarized</div>
                                            </div>

                                            {/* Concepts */}
                                            <div className="lv-stat-card">
                                                <div className="lv-stat-icon">
                                                    <Star size={13} />
                                                </div>
                                                <div className="lv-stat-label">Concepts</div>
                                                <div className="lv-stat-val">{topicCount || '—'}</div>
                                                <div className="lv-stat-sub">key cards</div>
                                            </div>

                                            {/* Compression */}
                                            <div className="lv-stat-card">
                                                <div className="lv-stat-icon">
                                                    <Minimize2 size={13} />
                                                </div>
                                                <div className="lv-stat-label">Compression</div>
                                                <div className="lv-stat-val" style={{ fontSize: 17 }}>{stats.compression_ratio || '—'}</div>
                                                <div className="lv-stat-sub">summary ratio</div>
                                            </div>

                                            {/* Language */}
                                            <div className="lv-stat-card">
                                                <div className="lv-stat-icon">
                                                    <Globe size={13} />
                                                </div>
                                                <div className="lv-stat-label">Language</div>
                                                <div className="lv-stat-val" style={{ fontSize: 15 }}>{LANG_NAMES[stats.language] || (stats.language || '—').toUpperCase()}</div>
                                            </div>

                                            {/* Share views — conditional */}
                                            {lecture?.share_views > 0 && (
                                                <div className="lv-stat-card">
                                                    <div className="lv-stat-icon">
                                                        <Eye size={13} />
                                                    </div>
                                                    <div className="lv-stat-label">Share views</div>
                                                    <div className="lv-stat-val">{lecture.share_views}</div>
                                                </div>
                                            )}

                                            {/* Visual frames — conditional */}
                                            {visualFrames && visualFrames.length > 0 && (() => {
                                                const screenCount = visualFrames.filter(f => (f.source || 'screen') === 'screen').length;
                                                const boardCount  = visualFrames.filter(f => f.source === 'board').length;
                                                return (
                                                    <div className="lv-stat-card">
                                                        <div className="lv-stat-icon">
                                                            <Monitor size={13} />
                                                        </div>
                                                        <div className="lv-stat-label">Visual frames</div>
                                                        <div className="lv-stat-val">{visualFrames.length}</div>
                                                        <div className="lv-stat-sub">
                                                            {screenCount > 0 && boardCount > 0
                                                                ? `${screenCount} screen · ${boardCount} board`
                                                                : screenCount > 0 ? `${screenCount} screen` : `${boardCount} board`
                                                            }
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* Domain / topic */}
                                            {lecture?.topic && (
                                                <div className="lv-stat-card lv-stat-full">
                                                    <div className="lv-stat-label" style={{ marginBottom: 8 }}>Domain</div>
                                                    <div className="lv-stat-topic-row">
                                                        <span className="lv-pill lv-pill-topic" style={{ fontSize: 12, padding: '3px 10px' }}>{lecture.topic}</span>
                                                        {lecture?.language && <span className="lv-pill lv-pill-lang" style={{ fontSize: 12, padding: '3px 10px' }}>{LANG_NAMES[lecture.language] || lecture.language.toUpperCase()}</span>}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                }
                            </div>
                        )}

                        {/* Flashcards */}
                        {activeTab === 'flashcards' && (() => {
                            const cards = lecture?.flashcards || [];
                            if (!cards.length) return <div className="lv-empty-panel">No flashcards yet</div>;
                            const card = cards[fcIdx];
                            const pct = ((fcIdx + 1) / cards.length * 100).toFixed(1);
                            return (
                                <div className="lv-tab-body">
                                    <div className="lv-fc-wrap">
                                        {/* Progress bar */}
                                        <div className="lv-fc-progress">
                                            <div className="lv-fc-progress-bar" style={{ width: `${pct}%` }} />
                                        </div>
                                        {/* Flip card */}
                                        <div className={`lv-card-flip${fcFlipped ? ' flipped' : ''}`} onClick={() => setFcFlipped(f => !f)}>
                                            <div className="lv-card-inner">
                                                <div className="lv-card-face">
                                                    <div className="lv-fc-side-label">Question</div>
                                                    <div className="lv-card-text">{card.front}</div>
                                                </div>
                                                <div className="lv-card-face lv-card-back">
                                                    <div className="lv-fc-side-label">Answer</div>
                                                    <div className="lv-card-text">{card.back}</div>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Hint */}
                                        <div className="lv-fc-hint">Tap to flip · Use arrows to navigate</div>
                                        {/* Nav */}
                                        <div className="lv-fc-nav">
                                            <button className="lv-fc-btn" disabled={fcIdx === 0}
                                                onClick={() => { setFcIdx(i => Math.max(0, i-1)); setFcFlipped(false); }}>
                                                <ChevronLeft size={12} />
                                                Prev
                                            </button>
                                            <span className="lv-fc-count">{fcIdx + 1} / {cards.length}</span>
                                            <button className="lv-fc-btn" disabled={fcIdx === cards.length - 1}
                                                onClick={() => { setFcIdx(i => Math.min(cards.length-1, i+1)); setFcFlipped(false); }}>
                                                Next
                                                <ChevronRight size={12} />
                                            </button>
                                            <button className="lv-fc-btn" onClick={() => { setFcIdx(Math.floor(Math.random() * cards.length)); setFcFlipped(false); }}>
                                                <Shuffle size={11} />
                                                Shuffle
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Quiz */}
                        {activeTab === 'quiz' && (() => {
                            const questions = lecture?.quiz || [];
                            if (!questions.length) return <div className="lv-empty-panel">No quiz yet</div>;
                            const answeredCount = Object.keys(quizAnswers).length;
                            const correctCount = questions.reduce((acc, q, qi) => {
                                const chosen = quizAnswers[qi];
                                const correctLetter = (q.answer || '').charAt(0).toUpperCase();
                                return acc + (chosen === correctLetter ? 1 : 0);
                            }, 0);
                            const allAnswered = answeredCount === questions.length;
                            return (
                                <div className="lv-tab-body" style={{ position: 'relative' }}>
                                    {/* Practice Mode Overlay */}
                                    {practiceMode && (
                                        <div className="lv-practice-overlay">
                                            <div className="lv-practice-header">
                                                <div className="lv-practice-timer">
                                                    <Timer size={13} />
                                                    {fmtTime(practiceTimer)}
                                                </div>
                                                <div className="lv-practice-progress">
                                                    {practiceDone ? 'Complete' : `${practiceIdx + 1} / ${questions.length}`}
                                                </div>
                                                <button onClick={() => setPracticeMode(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', fontFamily: 'inherit', fontSize: 12 }}>Exit</button>
                                            </div>
                                            <div className="lv-practice-body">
                                                {practiceDone ? (
                                                    <div className="lv-practice-result">
                                                        {(() => {
                                                            const sc = questions.reduce((acc, q, i) => acc + (practiceAnswers[i] === (q.answer || '').charAt(0).toUpperCase() ? 1 : 0), 0);
                                                            const pct = Math.round((sc / questions.length) * 100);
                                                            return (
                                                                <>
                                                                    <div style={{ color: pct >= 70 ? '#22c55e' : '#f59e0b', fontSize: 44 }}>
                                                                        {pct >= 70 ? <CheckCircle size={44} /> : <XCircle size={44} />}
                                                                    </div>
                                                                    <div className="lv-practice-score">{sc}/{questions.length}</div>
                                                                    <div className="lv-practice-score-label">{pct}% correct · {fmtTime(practiceTimer)}</div>
                                                                    <button className="lv-btn-primary" style={{ fontSize: 12, padding: '8px 20px' }} onClick={startPractice}>Try again</button>
                                                                    <button onClick={() => { setPracticeMode(false); }} style={{ fontSize: 12, color: 'var(--color-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>See review mode</button>
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                ) : (
                                                    (() => {
                                                        const q = questions[practiceIdx];
                                                        const correctLetter = (q.answer || '').charAt(0).toUpperCase();
                                                        const chosen = practiceAnswers[practiceIdx];
                                                        const answered = chosen !== undefined;
                                                        return (
                                                            <>
                                                                <div className="lv-practice-q-text">{q.question}</div>
                                                                {(q.options || []).map((opt, oi) => {
                                                                    const letter = String.fromCharCode(65 + oi);
                                                                    let cls = 'lv-quiz-opt';
                                                                    if (answered) {
                                                                        if (letter === correctLetter) cls += ' correct';
                                                                        else if (letter === chosen) cls += ' wrong';
                                                                    }
                                                                    return (
                                                                        <button key={oi} className={cls}
                                                                            disabled={answered}
                                                                            onClick={() => handlePracticeAnswer(practiceIdx, letter, questions)}>
                                                                            <span className="lv-quiz-opt-letter">{letter}</span>
                                                                            {opt}
                                                                        </button>
                                                                    );
                                                                })}
                                                                {answered && (
                                                                    <div style={{ marginTop: 12 }}>
                                                                        {q.explanation && (
                                                                            <div className="lv-quiz-expl">
                                                                                <span className="lv-quiz-expl-icon">💡</span>
                                                                                {q.explanation}
                                                                            </div>
                                                                        )}
                                                                        {practiceIdx < questions.length - 1 && (
                                                                            <button className="lv-btn-primary" style={{ fontSize: 12, padding: '7px 18px', marginTop: 10 }}
                                                                                onClick={() => setPracticeIdx(i => i + 1)}>Next →</button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </>
                                                        );
                                                    })()
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Regular quiz header */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{questions.length} questions</div>
                                        <button className="lv-btn-primary" style={{ fontSize: 11, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 5 }}
                                            onClick={startPractice}>
                                            <Play size={10} /> Practice
                                        </button>
                                    </div>

                                    {/* Score banner */}
                                    {answeredCount > 0 && (
                                        <div className="lv-quiz-score">
                                            <div className="lv-quiz-score-dot" style={{
                                                background: allAnswered
                                                    ? (correctCount / questions.length >= 0.7 ? '#22c55e' : '#f59e0b')
                                                    : 'var(--color-muted)'
                                            }} />
                                            {allAnswered
                                                ? `${correctCount} / ${questions.length} correct${correctCount === questions.length ? ' — Perfect! 🎉' : ''}`
                                                : `${answeredCount} / ${questions.length} answered`
                                            }
                                            {allAnswered && answeredCount > 0 && (
                                                <button
                                                    onClick={() => setQuizAnswers({})}
                                                    style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-muted)', background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                                    Reset
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    {questions.map((q, qi) => {
                                        const chosen = quizAnswers[qi];
                                        const answered = chosen !== undefined;
                                        const correctLetter = (q.answer || '').charAt(0).toUpperCase();
                                        return (
                                            <div key={qi} className="lv-quiz-q">
                                                <div className="lv-quiz-qrow">
                                                    <div className="lv-quiz-num">{qi + 1}</div>
                                                    <div className="lv-quiz-qtext">{q.question}</div>
                                                </div>
                                                {(q.options || []).map((opt, oi) => {
                                                    const letter = String.fromCharCode(65 + oi);
                                                    let cls = 'lv-quiz-opt';
                                                    if (answered) {
                                                        if (letter === correctLetter) cls += ' correct';
                                                        else if (letter === chosen) cls += ' wrong';
                                                    }
                                                    return (
                                                        <button key={oi} className={cls}
                                                            disabled={answered}
                                                            onClick={() => setQuizAnswers(a => ({ ...a, [qi]: letter }))}>
                                                            <span className="lv-quiz-opt-letter">{letter}</span>
                                                            {opt}
                                                        </button>
                                                    );
                                                })}
                                                {answered && q.explanation && (
                                                    <div className="lv-quiz-expl">
                                                        <span className="lv-quiz-expl-icon">💡</span>
                                                        {q.explanation}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Past Attempts */}
                                    <button className="lv-past-toggle" onClick={loadPastAttempts}>
                                        {pastOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                        Past Attempts
                                    </button>
                                    {pastOpen && (
                                        <div style={{ marginTop: 8 }}>
                                            {pastLoading ? (
                                                <div style={{ fontSize: 12, color: 'var(--color-muted)', padding: '8px 0' }}>Loading…</div>
                                            ) : pastAttempts && pastAttempts.length === 0 ? (
                                                <div style={{ fontSize: 12, color: 'var(--color-muted)', padding: '8px 0' }}>No attempts yet</div>
                                            ) : (pastAttempts || []).map((a, i) => (
                                                <div key={i} className="lv-past-row">
                                                    <div className="lv-past-score">{a.score}/{a.total}</div>
                                                    <div className="lv-past-date">{new Date(a.attempted_at).toLocaleDateString()}</div>
                                                    {a.duration_seconds != null && (
                                                        <div className="lv-past-dur">{fmtTime(a.duration_seconds)}</div>
                                                    )}
                                                    {a.weak_topics && a.weak_topics.length > 0 && (
                                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                            {a.weak_topics.slice(0, 3).map((t, ti) => (
                                                                <span key={ti} className="lv-practice-weak-chip">{t}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Terms (Glossary) */}
                        {activeTab === 'glossary' && (() => {
                            const terms = lecture?.glossary || [];
                            if (!terms.length) return <div className="lv-empty-panel">No glossary yet</div>;
                            const sorted = [...terms].sort((a, b) => (a.term || '').localeCompare(b.term || ''));
                            const q = glossarySearch.trim().toLowerCase();
                            const filtered = q
                                ? sorted.filter(g => (g.term || '').toLowerCase().includes(q) || (g.definition || '').toLowerCase().includes(q))
                                : sorted;
                            // Group by first letter when not searching
                            const groups = q ? null : filtered.reduce((acc, g) => {
                                const letter = (g.term || '?')[0].toUpperCase();
                                if (!acc[letter]) acc[letter] = [];
                                acc[letter].push(g);
                                return acc;
                            }, {});
                            return (
                                <div className="lv-tab-body">
                                    <div className="lv-gloss-hdr">
                                        <input
                                            className="lv-search-input"
                                            type="search"
                                            placeholder="Search terms…"
                                            value={glossarySearch}
                                            onChange={e => setGlossarySearch(e.target.value)}
                                            style={{ flex: 1 }}
                                        />
                                        <span className="lv-gloss-count">{filtered.length}</span>
                                    </div>
                                    {filtered.length === 0
                                        ? <div style={{ fontSize: 13, color: 'var(--color-muted)', textAlign: 'center', paddingTop: 16 }}>No terms match</div>
                                        : q
                                            ? filtered.map((g, i) => (
                                                <div key={i} className="lv-gloss-row">
                                                    <div className="lv-gloss-term">{g.term}</div>
                                                    <div className="lv-gloss-def">{g.definition}</div>
                                                </div>
                                            ))
                                            : Object.keys(groups).sort().map(letter => (
                                                <div key={letter}>
                                                    <div className="lv-gloss-group-letter">{letter}</div>
                                                    {groups[letter].map((g, i) => (
                                                        <div key={i} className="lv-gloss-row">
                                                            <div className="lv-gloss-term">{g.term}</div>
                                                            <div className="lv-gloss-def">{g.definition}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))
                                    }
                                </div>
                            );
                        })()}

                        {/* Exam Prep */}
                        {activeTab === 'exam' && (
                            <div className="lv-tab-body">
                                {examLoading ? (
                                    <div style={{ fontSize: 13, color: 'var(--color-muted)', padding: '40px 16px', textAlign: 'center' }}>Generating exam questions…</div>
                                ) : examPrep === 'locked' ? (
                                    <div className="lv-empty-panel">Exam prep requires Student plan or higher.</div>
                                ) : examPrep === null ? (
                                    <div className="lv-exam-gen-wrap">
                                        <div style={{ fontSize: 13, color: 'var(--color-muted)', textAlign: 'center' }}>Exam questions will be generated from your lecture summary.</div>
                                        <button className="lv-btn-primary" style={{ fontSize: 12, padding: '8px 20px' }}
                                            onClick={() => {
                                                setExamLoading(true);
                                                api.get(`/api/v1/lectures/${id}/exam-prep`)
                                                    .then(res => setExamPrep(res.data.questions || []))
                                                    .catch(err => {
                                                        if (err?.response?.status === 403) setExamPrep('locked');
                                                        else setExamPrep([]);
                                                    })
                                                    .finally(() => setExamLoading(false));
                                            }}>
                                            Generate Exam Questions
                                        </button>
                                    </div>
                                ) : examPrep.length === 0 ? (
                                    <div className="lv-empty-panel">No exam questions generated yet. Make sure your lecture has a summary.</div>
                                ) : (
                                    <>
                                        <div className="lv-exam-filters">
                                            {['all', 'easy', 'medium', 'hard'].map(f => (
                                                <button key={f} className={`lv-exam-filter${examFilter === f ? ' active' : ''}`}
                                                    onClick={() => setExamFilter(f)}>
                                                    {f.charAt(0).toUpperCase() + f.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                        {examPrep
                                            .filter(q => examFilter === 'all' || q.difficulty === examFilter)
                                            .map((q, i) => (
                                                <div key={i} className="lv-exam-q">
                                                    <div className="lv-exam-q-header" onClick={() => setExamRevealed(r => ({ ...r, [i]: !r[i] }))}>
                                                        <div className="lv-exam-q-text">{q.question}</div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                                            <span className={`lv-exam-diff lv-exam-diff-${q.difficulty}`}>{q.difficulty}</span>
                                                            <button className="lv-exam-reveal-btn" onClick={e => { e.stopPropagation(); setExamRevealed(r => ({ ...r, [i]: !r[i] })); }}>
                                                                {examRevealed[i] ? 'Hide' : 'Reveal'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {examRevealed[i] && (
                                                        <div className="lv-exam-answer">
                                                            <div className="lv-exam-answer-text">{q.model_answer}</div>
                                                            {q.key_points && q.key_points.length > 0 && (
                                                                <ul className="lv-exam-kp-list">
                                                                    {q.key_points.map((kp, ki) => (
                                                                        <li key={ki} className="lv-exam-kp-item">{kp}</li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        }
                                    </>
                                )}
                            </div>
                        )}


                    </div>
                </div>
            </div>

        {selInfo.show && (
            <button
                className="lv-explain-btn"
                style={{ left: selInfo.x, top: selInfo.y }}
                onMouseDown={e => e.preventDefault()}
                onClick={handleExplain}
            >
                ✦ Explain
            </button>
        )}

        {explainPanel.show && (
            <div className="lv-explain-overlay">
                <div className="lv-explain-backdrop" onClick={() => setExplainPanel(p => ({ ...p, show: false }))} />
                <div className="lv-explain-panel">
                    <div className="lv-explain-header">
                        <div className="lv-explain-title">
                            <div className="lv-explain-dot" />
                            Concept Breakdown
                        </div>
                        <button className="lv-explain-close" onClick={() => setExplainPanel(p => ({ ...p, show: false }))}>
                            <X size={14} />
                        </button>
                    </div>
                    <div className="lv-explain-body">
                        {explainPanel.loading ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                                <div className="lv-explain-spinner" />
                                <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Analyzing concept…</p>
                            </div>
                        ) : explainPanel.data ? (
                            <>
                                <div>
                                    <div className="lv-explain-section-label">Explanation</div>
                                    <p className="lv-explain-text">{explainPanel.data.explanation}</p>
                                </div>
                                {explainPanel.data.analogy && (
                                    <div className="lv-explain-analogy">
                                        <div className="lv-explain-section-label" style={{ color: '#92400e' }}>Analogy</div>
                                        <p className="lv-explain-analogy-text">{explainPanel.data.analogy}</p>
                                    </div>
                                )}
                                {explainPanel.data.breakdown && (
                                    <div>
                                        <div className="lv-explain-section-label">Step-by-Step</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {explainPanel.data.breakdown.split('\n').filter(l => l.trim()).map((step, i) => (
                                                <div key={i} className="lv-explain-step">
                                                    <span className="lv-explain-step-num">{String(i + 1).padStart(2, '0')}</span>
                                                    <p className="lv-explain-step-text">{step.replace(/^\d+\.\s*/, '')}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : null}
                    </div>
                </div>
            </div>
        )}

        {exportOpen && (
            <ExportModal
                lectureId={id}
                onClose={() => {
                    setExportOpen(false);
                    setExportInProgress(false);
                }}
                onStart={() => setExportInProgress(true)}
            />
        )}
        {shareOpen && (
            <ShareModal
                lectureId={id}
                initialToken={lecture?.share_token}
                onClose={() => setShareOpen(false)}
                addToast={addToast}
            />
        )}
        {showFeedbackCard && (
            <BetaFeedbackCard
                lectureId={id}
                onDismiss={() => setShowFeedbackCard(false)}
            />
        )}
        </>
    );
}
