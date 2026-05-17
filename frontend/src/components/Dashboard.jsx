import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useClerk } from '@clerk/react';
import api from '../lib/api';
import { useCreditsApi } from '../lib/creditsApi.js';
import { useToast } from './Toast';
import ExportModal from './ExportModal';
import ImportModal from './ImportModal';
import Footer from './Footer';
import { useSEO } from '../lib/useSEO';
import BetaApplyModal from './BetaApplyModal';
import { trackPageview } from '../lib/trackPageview';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
    bg: 'var(--color-bg)', text: 'var(--color-text)', sec: 'var(--color-sec)', muted: 'var(--color-muted)',
    border: 'var(--color-border)', borderHov: 'var(--color-border-hov)', card: 'var(--color-card)', dark: 'var(--color-dark)',
    darkFg: 'var(--color-dark-fg)',
};

const CSS = `
  .db * { box-sizing: border-box; }
  .db { font-family: 'Inter', sans-serif; background: ${C.bg}; color: ${C.text}; min-height: 100vh; -webkit-font-smoothing: antialiased; }

  /* Header */
  .db-header { height: 56px; background: ${C.card}; border-bottom: 1px solid ${C.border}; display: flex; align-items: center; padding: 0 24px; gap: 12px; position: sticky; top: 0; z-index: 20; }
  .db-logo { display: flex; align-items: center; gap: 8px; text-decoration: none; }
  .db-logo-icon { width: 24px; height: 24px; background: ${C.dark}; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .db-wordmark { font-size: 14px; font-weight: 600; color: ${C.text}; letter-spacing: -0.3px; }
  .db-header-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
  .db-btn-new { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; background: ${C.dark}; color: ${C.darkFg}; font-size: 13px; font-weight: 500; border: none; border-radius: 9px; cursor: pointer; text-decoration: none; transition: opacity 0.15s; font-family: inherit; white-space: nowrap; }
  .db-btn-new:hover { opacity: 0.82; }
  .db-btn-import { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; background: none; color: ${C.sec}; font-size: 13px; font-weight: 500; border: 1px solid ${C.border}; border-radius: 9px; cursor: pointer; text-decoration: none; transition: border-color 0.15s, color 0.15s; font-family: inherit; white-space: nowrap; }
  .db-btn-import:hover { border-color: ${C.borderHov}; color: ${C.text}; }

  /* Avatar / dropdown */
  .db-avatar-wrap { position: relative; }
  .db-avatar { width: 32px; height: 32px; border-radius: 50%; background: ${C.dark}; color: ${C.darkFg}; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; cursor: pointer; border: none; transition: opacity 0.15s; font-family: inherit; }
  .db-avatar:hover { opacity: 0.8; }
  .db-dropdown { position: absolute; right: 0; top: 40px; z-index: 30; background: ${C.card}; border: 1px solid ${C.border}; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); width: 216px; overflow: hidden; }
  .db-dropdown-head { padding: 12px 14px; border-bottom: 1px solid ${C.border}; }
  .db-dropdown-label { font-size: 11px; color: ${C.muted}; margin-bottom: 2px; }
  .db-dropdown-email { font-size: 12px; font-weight: 500; color: ${C.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .db-dropdown-item { display: block; width: 100%; text-align: left; padding: 9px 14px; font-size: 13px; color: ${C.sec}; background: none; border: none; font-family: inherit; cursor: pointer; transition: background 0.12s; text-decoration: none; }
  .db-dropdown-item:hover { background: ${C.bg}; }
  .db-dropdown-divider { height: 1px; background: ${C.border}; }
  .db-dropdown-signout { display: block; width: 100%; text-align: left; padding: 9px 14px; font-size: 13px; color: #ef4444; background: none; border: none; cursor: pointer; transition: background 0.12s; font-family: inherit; }
  .db-dropdown-signout:hover { background: #fff5f5; }

  /* Main content */
  .db-main { max-width: 980px; margin: 0 auto; padding: 36px 24px 80px; }
  .db-page-title { font-size: 22px; font-weight: 600; color: ${C.text}; letter-spacing: -0.5px; margin: 0 0 2px; }
  .db-page-sub { font-size: 13px; color: ${C.muted}; margin: 0 0 24px; }

  /* Announcements */
  .db-announcement { display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; line-height: 1.5; }
  .db-announcement-info { background: #0369a115; border: 1px solid #0369a133; color: #7dd3fc; }
  .db-announcement-warning { background: #78350f15; border: 1px solid #78350f33; color: #fcd34d; }
  .db-announcement-maintenance { background: #7f1d1d15; border: 1px solid #7f1d1d33; color: #fca5a5; }
  .db-announcement-dismiss { margin-left: auto; cursor: pointer; background: none; border: none; color: inherit; opacity: 0.6; font-size: 16px; padding: 0 4px; line-height: 1; flex-shrink: 0; }
  .db-announcement-dismiss:hover { opacity: 1; }

  /* Search */
  .db-search-wrap { position: relative; margin-bottom: 10px; }
  .db-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: ${C.muted}; pointer-events: none; }
  .db-search { width: 100%; padding: 9px 12px 9px 34px; border: 1px solid ${C.border}; border-radius: 10px; font-size: 13px; color: ${C.text}; background: ${C.card}; outline: none; transition: border-color 0.15s; font-family: inherit; }
  .db-search:focus { border-color: #c0bdb8; }
  .db-search::placeholder { color: ${C.muted}; }

  /* Filters */
  .db-filters { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
  .db-filter-select { padding: 5px 10px; border: 1px solid ${C.border}; border-radius: 7px; font-size: 12px; color: ${C.sec}; background: ${C.card}; outline: none; cursor: pointer; font-family: inherit; }
  .db-filter-clear { font-size: 12px; color: ${C.sec}; background: none; border: none; cursor: pointer; text-decoration: underline; font-family: inherit; padding: 0; margin-left: 4px; }

  /* Grid */
  .db-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  @media (max-width: 860px) { .db-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 540px) { .db-grid { grid-template-columns: 1fr; } }

  /* Card */
  .db-card { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 14px; padding: 20px; cursor: pointer; position: relative; transition: border-color 0.15s, transform 0.15s; display: flex; flex-direction: column; }
  .db-card:hover { border-color: ${C.borderHov}; transform: translateY(-1px); }

  .db-card-top { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
  .db-card-title { flex: 1; font-size: 14px; font-weight: 500; color: ${C.text}; letter-spacing: -0.2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4; }
  .db-card-date { font-size: 12px; color: ${C.muted}; white-space: nowrap; flex-shrink: 0; margin-top: 2px; }

  .db-pills { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 10px; }
  .db-pill { font-size: 11px; padding: 2px 8px; border-radius: 5px; white-space: nowrap; line-height: 1.6; }
  .db-pill-topic { background: #f3f0ff; color: #7c3aed; border: 1px solid #e9d5ff; }
  .db-pill-lang { background: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe; }
  .db-pill-dur { background: #f0ede8; color: ${C.sec}; border: 1px solid ${C.borderHov}; }

  .db-card-preview { font-size: 12px; color: ${C.sec}; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; flex: 1; margin-bottom: 14px; }
  .db-card-preview-empty { font-size: 12px; color: ${C.muted}; font-style: italic; flex: 1; margin-bottom: 14px; }

  .db-card-footer { display: flex; align-items: center; margin-top: auto; }
  .db-card-stat { font-size: 11px; color: ${C.muted}; flex: 1; }
  .db-menu-wrap { position: relative; }
  .db-menu-btn { width: 26px; height: 26px; border-radius: 7px; display: flex; align-items: center; justify-content: center; color: ${C.muted}; background: none; border: none; cursor: pointer; transition: background 0.12s, color 0.12s, opacity 0.12s; opacity: 0; }
  .db-card:hover .db-menu-btn { opacity: 1; }
  .db-menu-btn:hover { background: ${C.bg}; color: ${C.text}; }
  .db-card-menu { position: absolute; right: 0; bottom: calc(100% + 4px); z-index: 20; background: ${C.card}; border: 1px solid ${C.border}; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); width: 160px; overflow: hidden; }
  .db-card-menu-item { display: block; width: 100%; text-align: left; padding: 8px 12px; font-size: 13px; color: ${C.text}; background: none; border: none; cursor: pointer; transition: background 0.1s; font-family: inherit; }
  .db-card-menu-item:hover { background: ${C.bg}; }
  .db-card-menu-item.danger { color: #ef4444; }
  .db-card-menu-item.danger:hover { background: #fff5f5; }
  .db-card-menu-divider { height: 1px; background: ${C.border}; }

  /* Skeleton */
  .db-skeleton { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 14px; padding: 20px; height: 170px; }
  .db-skeleton-line { height: 10px; background: ${C.border}; border-radius: 6px; margin-bottom: 10px; animation: db-shimmer 1.5s ease-in-out infinite; }
  @keyframes db-shimmer { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }

  /* Empty state */
  .db-empty { text-align: center; padding: 80px 24px 40px; }
  .db-empty-num { font-size: 72px; font-weight: 700; color: ${C.border}; font-family: 'Courier New', monospace; letter-spacing: -6px; line-height: 1; margin-bottom: 20px; }
  .db-empty-title { font-size: 18px; font-weight: 500; color: ${C.text}; letter-spacing: -0.4px; margin: 0 0 6px; }
  .db-empty-sub { font-size: 14px; color: ${C.sec}; margin: 0 0 24px; }
  .db-btn-start { display: inline-block; padding: 10px 22px; background: ${C.dark}; color: ${C.darkFg}; font-size: 13px; font-weight: 500; border: none; border-radius: 10px; cursor: pointer; text-decoration: none; transition: opacity 0.15s; font-family: inherit; }
  .db-btn-start:hover { opacity: 0.82; }

  /* Delete modal */
  .db-modal-overlay { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3); backdrop-filter: blur(4px); }
  .db-modal { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 16px; padding: 28px; width: 100%; max-width: 400px; margin: 0 16px; }
  .db-modal-title { font-size: 16px; font-weight: 600; color: ${C.text}; letter-spacing: -0.4px; margin: 0 0 8px; }
  .db-modal-sub { font-size: 14px; color: ${C.sec}; line-height: 1.6; margin: 0 0 24px; }
  .db-modal-btns { display: flex; gap: 8px; }
  .db-btn-ghost { flex: 1; padding: 10px; background: ${C.bg}; color: ${C.text}; font-size: 13px; border: 1px solid ${C.border}; border-radius: 10px; cursor: pointer; font-family: inherit; transition: border-color 0.15s; }
  .db-btn-ghost:hover { border-color: ${C.borderHov}; }
  .db-btn-danger { flex: 1; padding: 10px; background: #ef4444; color: #fff; font-size: 13px; font-weight: 500; border: none; border-radius: 10px; cursor: pointer; transition: opacity 0.15s; font-family: inherit; }
  .db-btn-danger:hover { opacity: 0.85; }
  .db-btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
  .db-no-match { font-size: 14px; color: ${C.sec}; padding: 32px 0; text-align: center; }
  .db-no-match-clear { background: none; border: none; cursor: pointer; font-family: inherit; font-size: 13px; color: ${C.sec}; text-decoration: underline; display: block; margin: 6px auto 0; }

  /* Usage banner */
  .db-usage-banner { background: var(--color-card); border-bottom: 1px solid var(--color-border); padding: 10px 24px; }
  .db-usage-inner { max-width: 980px; margin: 0 auto; display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
  .db-usage-row { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 180px; }
  .db-usage-label { font-size: 12px; color: var(--color-sec); white-space: nowrap; }
  .db-usage-bar { flex: 1; height: 4px; background: var(--color-border); border-radius: 4px; overflow: hidden; min-width: 60px; }
  .db-usage-fill-blue { height: 100%; background: #3b82f6; border-radius: 4px; transition: width 0.5s ease; }
  .db-usage-fill-blue.warn { background: #f59e0b; }
  .db-usage-fill-blue.full { background: #ef4444; }
  .db-usage-fill-purple { height: 100%; background: #7c3aed; border-radius: 4px; transition: width 0.5s ease; }
  .db-usage-fill-purple.warn { background: #f59e0b; }
  .db-usage-fill-purple.full { background: #ef4444; }
  .db-usage-count { font-size: 11px; color: var(--color-muted); font-family: monospace; white-space: nowrap; }
  .db-usage-resets { font-size: 11px; color: var(--color-muted); margin-left: auto; white-space: nowrap; }
  .db-usage-upgrade { font-size: 12px; color: var(--color-text); font-weight: 500; text-decoration: none; white-space: nowrap; }
  .db-usage-upgrade:hover { text-decoration: underline; }

  /* ── Mobile ── */
  @media (max-width: 600px) {
    .db-header { padding: 0 16px; gap: 8px; }
    .db-main { padding: 20px 16px 60px; }
    .db-page-title { font-size: 18px; }
    .db-btn-text { display: none; }
    .db-btn-import { padding: 7px 9px; }
    .db-btn-new { padding: 7px 9px; }
    .db-menu-btn { opacity: 1 !important; }
    .db-empty { padding: 40px 16px 24px; }
    .db-empty-num { font-size: 52px; letter-spacing: -4px; }
    .db-filters { gap: 6px; }
    .db-filter-select { font-size: 12px; padding: 5px 8px; }
    .db-proc-card { padding: 14px 16px; gap: 8px; }
    .db-proc-section { margin-bottom: 20px; }
  }

  /* Onboarding modal */
  .ob-overlay { position: fixed; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.45); backdrop-filter: blur(6px); padding: 16px; }
  .ob-modal { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 20px; width: 100%; max-width: 480px; padding: 40px 36px 36px; box-shadow: 0 24px 64px rgba(0,0,0,0.14); text-align: center; }
  .ob-logo { width: 48px; height: 48px; background: ${C.dark}; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
  .ob-step-title { font-size: 20px; font-weight: 600; color: ${C.text}; letter-spacing: -0.5px; margin: 0 0 10px; }
  .ob-step-sub { font-size: 14px; color: ${C.sec}; line-height: 1.65; margin: 0 0 28px; }
  .ob-btn-primary { width: 100%; padding: 12px; background: ${C.dark}; color: #fafaf9; font-size: 14px; font-weight: 500; border: none; border-radius: 12px; cursor: pointer; font-family: inherit; transition: opacity 0.15s; }
  .ob-btn-primary:hover { opacity: 0.82; }
  .ob-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .ob-dots { display: flex; justify-content: center; gap: 6px; margin-top: 24px; }
  .ob-dot { width: 6px; height: 6px; border-radius: 50%; background: ${C.border}; transition: background 0.2s; }
  .ob-dot.active { background: ${C.dark}; }
  .ob-mic-icon { width: 56px; height: 56px; border-radius: 50%; background: #f0fdf4; border: 1.5px solid #bbf7d0; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #16a34a; }
  .ob-mic-granted { background: #f0fdf4; border-color: #86efac; }
  .ob-mic-denied { background: #fff5f5; border-color: #fecaca; color: #ef4444; }
  .ob-mic-status { font-size: 13px; margin-top: 12px; margin-bottom: 20px; }
  .ob-checkmark { width: 56px; height: 56px; border-radius: 50%; background: #f0fdf4; border: 1.5px solid #86efac; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #16a34a; }

  /* Credits chip */
  .db-credits-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 8px; border: 1px solid ${C.border}; background: ${C.card}; font-size: 12px; font-weight: 500; color: ${C.sec}; text-decoration: none; transition: border-color .15s, color .15s; white-space: nowrap; }
  .db-credits-chip:hover { border-color: ${C.dark}; color: ${C.text}; }
  .db-credits-chip.low { border-color: #fde68a; background: #fef3c7; color: #b45309; }
  .dark .db-credits-chip.low { background: rgba(217,119,6,0.15); border-color: rgba(251,191,36,0.3); color: #fbbf24; }
  .db-credits-chip.sub { border-color: rgba(22,163,74,0.35); background: rgba(22,163,74,0.07); color: #16a34a; }
  .dark .db-credits-chip.sub { background: rgba(22,163,74,0.12); border-color: rgba(22,163,74,0.3); color: #4ade80; }

  /* ── Dark mode overrides ── */
  .dark .db-pill-topic { background: #2d1a4a; color: #c4b5fd; border-color: #4c2d7a; }
  .dark .db-pill-lang  { background: #0f1e38; color: #93c5fd; border-color: #1e3a6a; }
  .dark .db-pill-dur   { background: var(--color-border); }
  .dark .db-card-menu-item.danger:hover { background: rgba(239,68,68,0.1); }
  .dark .db-dropdown-signout:hover      { background: rgba(239,68,68,0.1); }
  .dark .db-search:focus { border-color: var(--color-border-hov); }
  .dark .ob-mic-icon    { background: rgba(22,163,74,0.15); border-color: rgba(134,239,172,0.3); }
  .dark .ob-mic-granted { background: rgba(22,163,74,0.15); border-color: rgba(134,239,172,0.3); }
  .dark .ob-mic-denied  { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); }
  .dark .ob-checkmark   { background: rgba(22,163,74,0.15); border-color: rgba(134,239,172,0.3); }

  /* Beta banner */
  .db-beta-banner {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 10px 14px; border-radius: 10px; margin-bottom: 14px;
    font-size: 13px; line-height: 1.5;
  }
  .db-beta-banner.open { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
  .db-beta-banner.pending { background: #fefce8; border: 1px solid #fde68a; color: #713f12; }
  .db-beta-banner.active { background: #f0fdf4; border: 1px solid #86efac; color: #15803d; }
  .db-beta-banner.expired { background: var(--color-card); border: 1px solid var(--color-border); color: var(--color-sec); }
  .dark .db-beta-banner.open { background: rgba(22,163,74,0.1); border-color: rgba(134,239,172,0.25); color: #4ade80; }
  .dark .db-beta-banner.active { background: rgba(22,163,74,0.1); border-color: rgba(22,163,74,0.3); color: #4ade80; }
  .dark .db-beta-banner.pending { background: rgba(202,138,4,0.1); border-color: rgba(253,224,71,0.25); color: #fbbf24; }
  .db-beta-banner-text { flex: 1; min-width: 0; }
  .db-beta-banner-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; flex-shrink: 0; }
  .db-beta-apply {
    padding: 5px 12px; border: none; border-radius: 7px;
    font-size: 12px; font-weight: 600; cursor: pointer;
    font-family: inherit; transition: opacity 0.15s; white-space: nowrap; flex-shrink: 0;
    background: #166534; color: #fff;
  }
  .dark .db-beta-apply { background: #15803d; }
  .db-beta-apply:hover { opacity: 0.88; }
  .db-beta-dismiss {
    margin-left: auto; cursor: pointer; background: none; border: none;
    color: inherit; opacity: 0.5; font-size: 16px; padding: 0 4px; line-height: 1;
    flex-shrink: 0; font-family: inherit;
  }
  .db-beta-dismiss:hover { opacity: 1; }
  @media (max-width: 480px) {
    .db-beta-banner { align-items: flex-start; }
    .db-beta-apply { width: 100%; text-align: center; }
  }

  /* Processing import cards */
  .db-proc-section { margin-bottom: 28px; }
  .db-proc-section-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: ${C.muted}; margin: 0 0 10px; }
  .db-proc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  @media (max-width: 860px) { .db-proc-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 540px) { .db-proc-grid { grid-template-columns: 1fr; } }
  .db-proc-card { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 14px; padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; }
  .db-proc-top { display: flex; align-items: center; gap: 10px; }
  @keyframes db-proc-spin { to { transform: rotate(360deg); } }
  .db-proc-ring { width: 20px; height: 20px; border-radius: 50%; border: 2px solid ${C.border}; border-top-color: ${C.dark}; animation: db-proc-spin 0.9s linear infinite; flex-shrink: 0; }
  .db-proc-name { font-size: 13px; font-weight: 500; color: ${C.text}; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .db-proc-status { font-size: 12px; color: ${C.sec}; }
  .db-proc-bar { height: 3px; background: ${C.border}; border-radius: 3px; overflow: hidden; }
  .db-proc-fill { height: 100%; background: ${C.dark}; border-radius: 3px; transition: width 0.5s ease; }
  .db-proc-date { font-size: 11px; color: ${C.muted}; }
`;

// ─── Import processing constants ──────────────────────────────────────────────
const IMPORT_STATUSES = new Set(['queued','importing','compressing','transcribing','cleaning','generating','storing','summarizing']);

const IMPORT_STATUS_MAP = {
    queued:       { label: 'Processing audio…',     pct: 25 },
    importing:    { label: 'Processing audio…',     pct: 32 },
    compressing:  { label: 'Processing audio…',     pct: 40 },
    transcribing: { label: 'Transcribing lecture…', pct: 58 },
    cleaning:     { label: 'Building your notes…',  pct: 74 },
    generating:   { label: 'Building your notes…',  pct: 84 },
    summarizing:  { label: 'Building your notes…',  pct: 84 },
    storing:      { label: 'Almost done…',           pct: 94 },
};

// ─── Theme toggle ─────────────────────────────────────────────────────────────
function ThemeToggle() {
    const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
    const toggle = () => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle('dark', next);
        localStorage.setItem('neurativo_theme', next ? 'dark' : 'light');
    };
    return (
        <button
            onClick={toggle}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{ width: 32, height: 32, borderRadius: 9, background: 'none', border: '1px solid var(--color-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-sec)', transition: 'border-color 0.15s, color 0.15s', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-border-hov)'; e.currentTarget.style.color = 'var(--color-text)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-sec)'; }}
        >
            {dark
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
            }
        </button>
    );
}

// ─── OnboardingModal ───────────────────────────────────────────────────────────
function OnboardingModal({ onDone }) {
    const navigate = useNavigate();
    const [step, setStep] = useState(0); // 0 | 1

    const finish = () => {
        localStorage.setItem('neurativo_onboarded', '1');
        onDone();
        navigate('/record');
    };

    const steps = [
        // Step 0 — Welcome
        <div key="0">
            <div className="ob-logo">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fafaf9" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
            </div>
            <h2 className="ob-step-title">Welcome to Neurativo</h2>
            <p className="ob-step-sub">Your AI-powered lecture assistant. Record any class, meeting, or talk and get an instant transcript, smart summary, and Q&A — in real time.</p>
            <button className="ob-btn-primary" onClick={() => setStep(1)}>Get started →</button>
        </div>,

        // Step 1 — Ready
        <div key="1">
            <div className="ob-checkmark">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            </div>
            <h2 className="ob-step-title">You're all set!</h2>
            <p className="ob-step-sub">Hit record, speak naturally, and watch Neurativo transcribe and summarise your lecture in real time.</p>
            <button className="ob-btn-primary" onClick={finish}>Start recording now →</button>
        </div>,
    ];

    return (
        <div className="ob-overlay">
            <div className="ob-modal">
                {steps[step]}
                <div className="ob-dots">
                    {[0, 1].map(i => <div key={i} className={`ob-dot${step === i ? ' active' : ''}`} />)}
                </div>
            </div>
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function smartDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function fmtDur(s) {
    if (!s) return '';
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
function langName(code) {
    const map = { en: 'English', ar: 'Arabic', zh: 'Chinese', fr: 'French', de: 'German', hi: 'Hindi', es: 'Spanish', it: 'Italian', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese', ru: 'Russian' };
    return map[code] || (code || '').toUpperCase();
}

// ─── UserMenu ─────────────────────────────────────────────────────────────────
function UserMenu({ user, onSignOut }) {
    const [open, setOpen] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const initials = (user?.email?.[0] || '?').toUpperCase();

    useEffect(() => {
        // Silently check admin access — only show link if verified
        import('../lib/adminApi.js').then(({ adminApi }) => {
            adminApi.verify().then(() => setIsAdmin(true)).catch(() => {});
        });
    }, []);

    return (
        <div className="db-avatar-wrap">
            <button className="db-avatar" onClick={() => setOpen(o => !o)}>{initials}</button>
            {open && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 29 }} onClick={() => setOpen(false)} />
                    <div className="db-dropdown">
                        <div className="db-dropdown-head">
                            <div className="db-dropdown-label">Signed in as</div>
                            <div className="db-dropdown-email">{user?.email}</div>
                        </div>
                        <Link to="/profile" className="db-dropdown-item" onClick={() => setOpen(false)}>Profile</Link>
                        <Link to="/credits" className="db-dropdown-item" onClick={() => setOpen(false)}>Credits</Link>
                        {isAdmin && (
                            <>
                                <div className="db-dropdown-divider" />
                                <Link to="/admin" className="db-dropdown-item" onClick={() => setOpen(false)} style={{ color: '#7c3aed' }}>Admin Panel</Link>
                            </>
                        )}
                        <div className="db-dropdown-divider" />
                        <button className="db-dropdown-signout" onClick={onSignOut}>Sign out</button>
                    </div>
                </>
            )}
        </div>
    );
}

// ─── ProcessingCard ───────────────────────────────────────────────────────────
function ProcessingCard({ lecture, statusKey }) {
    const { label, pct } = IMPORT_STATUS_MAP[statusKey] || { label: 'Processing…', pct: 30 };
    return (
        <div className="db-proc-card">
            <div className="db-proc-top">
                <div className="db-proc-ring" />
                <div className="db-proc-name">{lecture.title || 'Untitled Lecture'}</div>
            </div>
            <div className="db-proc-status">{label}</div>
            <div className="db-proc-bar">
                <div className="db-proc-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="db-proc-date">{smartDate(lecture.created_at)}</div>
        </div>
    );
}

// ─── LectureCard ──────────────────────────────────────────────────────────────
function LectureCard({ lecture, onDelete, onShare, onExport }) {
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    const preview = lecture.summary_preview;
    const hasSummary = preview && preview.trim().length > 0;
    const displayPreview = hasSummary ? preview.slice(0, 90) : null;

    const statParts = [];
    if (lecture.total_chunks > 0) statParts.push(`${lecture.total_chunks} chunks`);
    if (lecture.total_sections > 0) statParts.push(`${lecture.total_sections} sections`);

    return (
        <div className="db-card" onClick={() => navigate(`/lecture/${lecture.id}`)}>
            {/* Processing badge */}
            {['importing','compressing','transcribing','cleaning','generating','storing'].includes(lecture.summary_status) && (
                <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, padding: '2px 8px', borderRadius: 5,
                    background: '#ede9fe', color: '#7c3aed',
                    marginBottom: 8,
                }}>
                    &#x27F3; Processing&hellip;
                </span>
            )}

            {/* Top row: title + date */}
            <div className="db-card-top">
                <div className="db-card-title">{lecture.title || 'Untitled Lecture'}</div>
                <div className="db-card-date">{smartDate(lecture.created_at)}</div>
            </div>

            {/* Pills */}
            <div className="db-pills">
                {lecture.topic && <span className="db-pill db-pill-topic">{lecture.topic}</span>}
                {lecture.language && <span className="db-pill db-pill-lang">{langName(lecture.language)}</span>}
                {lecture.total_duration_seconds > 0 && <span className="db-pill db-pill-dur">{fmtDur(lecture.total_duration_seconds)}</span>}
            </div>

            {/* Preview */}
            {hasSummary
                ? <div className="db-card-preview">{displayPreview}{preview.length > 90 ? '…' : ''}</div>
                : <div className="db-card-preview-empty">Summary generating…</div>
            }

            {/* Footer */}
            <div className="db-card-footer">
                <div className="db-card-stat">{statParts.join(' · ')}</div>
                <div className="db-menu-wrap" ref={menuRef} onClick={e => e.stopPropagation()}>
                    <button className="db-menu-btn" onClick={() => setMenuOpen(o => !o)}>
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
                        </svg>
                    </button>
                    {menuOpen && (
                        <div className="db-card-menu">
                            <button className="db-card-menu-item" onClick={() => { setMenuOpen(false); navigate(`/lecture/${lecture.id}`); }}>Open</button>
                            <button className="db-card-menu-item" onClick={() => { setMenuOpen(false); onExport(lecture.id); }}>Export PDF</button>
                            <button className="db-card-menu-item" onClick={() => { setMenuOpen(false); onShare(lecture.id); }}>Share</button>
                            <div className="db-card-menu-divider" />
                            <button className="db-card-menu-item danger" onClick={() => { setMenuOpen(false); onDelete(lecture.id); }}>Delete</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard({ user }) {
    useSEO({ title: 'Dashboard', noindex: true });
    const navigate = useNavigate();
    const addToast  = useToast();
    const { signOut } = useClerk();
    const creditsApi = useCreditsApi();

    const [lectures, setLectures] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [usage, setUsage]       = useState(null);
    const [credits, setCredits]   = useState(null);
    const [search, setSearch]     = useState('');
    const [topicFilter, setTopicFilter] = useState('');
    const [langFilter,  setLangFilter]  = useState('');
    const [sortBy,    setSortBy]    = useState('newest'); // newest | oldest | az
    const [deleteId,  setDeleteId]  = useState(null);
    const [deleting,  setDeleting]  = useState(false);
    const [exportId,  setExportId]  = useState(null);
    const [importOpen, setImportOpen] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [jobStatuses, setJobStatuses] = useState({}); // { lectureId: statusKey }

    const searchRef = useRef(null);
    const searchTimerRef = useRef(null);
    const [searchResults, setSearchResults] = useState(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [semanticResults, setSemanticResults] = useState(null); // null = no semantic search done
    const semanticTimerRef = useRef(null);
    const [announcements, setAnnouncements] = useState([]);
    const [dismissedIds, setDismissedIds] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem('dismissed_ann') || '[]'); } catch { return []; }
    });
    const [betaEnabled, setBetaEnabled] = useState(false);
    const [betaApplication, setBetaApplication] = useState(undefined); // undefined = loading
    const [betaBannerDismissed, setBetaBannerDismissed] = useState(() => sessionStorage.getItem('beta_banner_dismissed') === '1');
    const [betaModalOpen, setBetaModalOpen] = useState(false);
    const [pwaBannerDismissed, setPwaBannerDismissed] = useState(() => sessionStorage.getItem('pwa_banner_dismissed') === '1');
    const isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const showPwaBanner = !pwaBannerDismissed && isMobileUA && !!window._pwaInstallPrompt;

    const handleSignOut = async () => {
        await signOut();
        navigate('/');
    };

    useEffect(() => { trackPageview('app'); }, []);

    useEffect(() => {
        api.get('/api/v1/usage').then(res => setUsage(res.data)).catch(() => {});
    }, []);

    useEffect(() => {
        creditsApi.getBalance().then(res => setCredits(res.data)).catch(() => {});
    }, []);

    useEffect(() => {
        api.get('/api/v1/announcements')
            .then(r => setAnnouncements(Array.isArray(r.data?.announcements) ? r.data.announcements : []))
            .catch(() => {});
    }, []);

    useEffect(() => {
        Promise.all([
            api.get('/api/v1/beta/status'),
            api.get('/api/v1/beta/me'),
        ]).then(([statusRes, meRes]) => {
            setBetaEnabled(statusRes.data?.enabled === true);
            setBetaApplication(meRes.data || null);
        }).catch(() => {
            setBetaApplication(null);
        });
    }, []);

    function dismissAnnouncement(id) {
        const next = [...dismissedIds, id];
        setDismissedIds(next);
        try { sessionStorage.setItem('dismissed_ann', JSON.stringify(next)); } catch {}
    }

    useEffect(() => {
        api.get('/api/v1/lectures?limit=50')
            .then(res => {
                const list = Array.isArray(res.data) ? res.data
                           : Array.isArray(res.data?.lectures) ? res.data.lectures : [];
                setLectures(list);
                if (list.length === 0 && !localStorage.getItem('neurativo_onboarded')) {
                    setShowOnboarding(true);
                }
            })
            .catch(() => setLectures([]))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => () => clearTimeout(searchTimerRef.current), []);

    // ── Register a newly-started background import ───────────────────────────
    const handleImportStarted = useCallback(async (id) => {
        try {
            const res = await api.get(`/api/v1/lectures/${id}`);
            if (res.data) {
                setLectures(prev => prev.some(l => l.id === id) ? prev : [res.data, ...prev]);
            }
        } catch {}
    }, []);

    // ── Poll processing imports every 4s ─────────────────────────────────────
    const processingLectures = lectures.filter(l => IMPORT_STATUSES.has(l.summary_status));
    const processingIdsKey   = processingLectures.map(l => l.id).join(',');

    useEffect(() => {
        if (!processingIdsKey) return;
        let cancelled = false;

        const poll = async () => {
            if (cancelled) return;
            for (const id of processingIdsKey.split(',')) {
                try {
                    const res = await api.get(`/api/v1/jobs/${id}`);
                    const status = res.data?.status;
                    if (!status || cancelled) continue;
                    setJobStatuses(prev => ({ ...prev, [id]: status }));
                    if (status === 'done' || status === 'failed') {
                        try {
                            const lr = await api.get(`/api/v1/lectures/${id}`);
                            if (!cancelled && lr.data) {
                                setLectures(prev => prev.map(l => l.id === id ? { ...l, ...lr.data } : l));
                            }
                        } catch {}
                    }
                } catch {}
            }
            if (!cancelled) setTimeout(poll, 4000);
        };

        poll();
        return () => { cancelled = true; };
    }, [processingIdsKey]);

    // Keyboard shortcuts: Escape clears, / focuses search, n = new lecture
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') { setSearch(''); setTopicFilter(''); setLangFilter(''); searchRef.current?.blur(); }
            if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
                e.preventDefault();
                searchRef.current?.focus();
            }
            if (e.key === 'n' && document.activeElement?.tagName !== 'INPUT') {
                navigate('/record');
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [navigate]);

    const handleDelete = async () => {
        if (!deleteId) return;
        setDeleting(true);
        try {
            await api.delete(`/api/v1/lectures/${deleteId}`);
            setLectures(p => p.filter(l => l.id !== deleteId));
            addToast({ type: 'success', message: 'Lecture deleted' });
        } catch {
            addToast({ type: 'error', message: 'Failed to delete lecture' });
        }
        setDeleting(false);
        setDeleteId(null);
    };

    const handleShare = async (id) => {
        try {
            const res = await api.post(`/api/v1/lectures/${id}/share`);
            const shareUrl = window.location.origin + res.data.share_url;
            try {
                await navigator.clipboard.writeText(shareUrl);
                addToast({ type: 'success', message: 'Link copied!' });
            } catch {
                addToast({ type: 'success', message: shareUrl });
            }
        } catch {
            addToast({ type: 'error', message: 'Failed to generate share link' });
        }
    };

    const handleExport = (id) => setExportId(id);

    // Derived
    const topics    = [...new Set(lectures.map(l => l.topic).filter(Boolean))];
    const languages = [...new Set(lectures.map(l => l.language).filter(Boolean))];
    const hasFilters = topicFilter || langFilter;

    const baseList = searchResults !== null ? searchResults : lectures;
    const filtered = baseList
        .filter(l => !IMPORT_STATUSES.has(l.summary_status))
        .filter(l => {
            const q = search.trim().toLowerCase();
            // When searchResults is active (backend search), backend already filtered
            // by content — only apply the dropdown filters client-side.
            const matchSearch = searchResults !== null || !q ||
                (l.title    || '').toLowerCase().includes(q) ||
                (l.topic    || '').toLowerCase().includes(q) ||
                (l.language || '').toLowerCase().includes(q);
            const matchTopic = !topicFilter || l.topic    === topicFilter;
            const matchLang  = !langFilter  || l.language === langFilter;
            return matchSearch && matchTopic && matchLang;
        })
        .sort((a, b) => {
            if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
            if (sortBy === 'az')     return (a.title || '').localeCompare(b.title || '');
            return new Date(b.created_at) - new Date(a.created_at); // newest
        });

    const lectureWord = lectures.length === 1 ? 'lecture' : 'lectures';

    return (
        <>
            <style>{CSS}</style>
            <div className="db">
                {/* ── Header ── */}
                <header className="db-header">
                    <Link to="/" className="db-logo">
                        <img src="/logo.png" alt="Neurativo" style={{ width: 24, height: 24, borderRadius: 6 }} />
                        <span className="db-wordmark">Neurativo</span>
                    </Link>
                    <div className="db-header-right">
                        <ThemeToggle />
                        {credits !== null && (() => {
                            const subActive = credits.credits_sub_status === 'monthly'
                                && credits.credits_sub_expires
                                && new Date(credits.credits_sub_expires) > new Date();
                            const chipClass = subActive ? ' sub' : credits.low_credits ? ' low' : '';
                            const chipTitle = subActive
                                ? `Monthly subscription active · expires ${new Date(credits.credits_sub_expires).toLocaleDateString()}`
                                : `${credits.credits} credit${credits.credits !== 1 ? 's' : ''} remaining`;
                            return (
                                <Link to="/credits" className={`db-credits-chip${chipClass}`} title={chipTitle}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                    {subActive ? '∞ sub' : `${credits.credits} cr${credits.low_credits ? ' ⚠' : ''}`}
                                </Link>
                            );
                        })()}
                        <button className="db-btn-import" onClick={() => setImportOpen(true)}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                            </svg>
                            <span className="db-btn-text">Import</span>
                        </button>
                        <button className="db-btn-new" onClick={() => navigate('/record')}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/>
                            </svg>
                            <span className="db-btn-text">New Lecture</span>
                        </button>
                        <UserMenu user={user} onSignOut={handleSignOut} />
                    </div>
                </header>

                {/* ── Usage banner (all plans) ── */}
                {usage && (
                    <div className="db-usage-banner">
                        <div className="db-usage-inner">
                            {/* Live lectures — only show if there's a count cap */}
                            {usage.lectures_limit != null && (
                                <div className="db-usage-row">
                                    <span className="db-usage-label">Live lectures</span>
                                    <div className="db-usage-bar">
                                        <div
                                            className={`db-usage-fill-blue${usage.lectures_this_month >= usage.lectures_limit ? ' full' : usage.lectures_this_month >= usage.lectures_limit * 0.8 ? ' warn' : ''}`}
                                            style={{ width: `${Math.min(100, (usage.lectures_this_month / usage.lectures_limit) * 100)}%` }}
                                        />
                                    </div>
                                    <span className="db-usage-count">{usage.lectures_this_month} / {usage.lectures_limit}</span>
                                </div>
                            )}
                            {/* Imports — only show if there's a count cap */}
                            {usage.uploads_limit != null && (
                                <div className="db-usage-row">
                                    <span className="db-usage-label">Imports</span>
                                    <div className="db-usage-bar">
                                        <div
                                            className={`db-usage-fill-purple${usage.uploads_this_month >= usage.uploads_limit ? ' full' : usage.uploads_this_month >= usage.uploads_limit * 0.8 ? ' warn' : ''}`}
                                            style={{ width: `${Math.min(100, (usage.uploads_this_month / usage.uploads_limit) * 100)}%` }}
                                        />
                                    </div>
                                    <span className="db-usage-count">{usage.uploads_this_month} / {usage.uploads_limit}</span>
                                </div>
                            )}
                            {/* Total hours — always show */}
                            {usage.total_hours_limit != null && (
                                <div className="db-usage-row">
                                    <span className="db-usage-label">Hours used</span>
                                    <div className="db-usage-bar">
                                        <div
                                            className={`db-usage-fill-blue${usage.total_hours_used >= usage.total_hours_limit ? ' full' : usage.total_hours_used >= usage.total_hours_limit * 0.8 ? ' warn' : ''}`}
                                            style={{ width: `${Math.min(100, (usage.total_hours_used / usage.total_hours_limit) * 100)}%` }}
                                        />
                                    </div>
                                    <span className="db-usage-count">{usage.total_hours_used}h / {usage.total_hours_limit}h</span>
                                </div>
                            )}
                            {usage.month_resets_at && (
                                <span className="db-usage-resets">
                                    Resets {new Date(usage.month_resets_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                <main className="db-main">
                    {/* PWA Install Banner — mobile only, one-time per session */}
                    {showPwaBanner && (
                        <div className="db-announcement db-announcement-info" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ flex: 1 }}>
                                📲 <strong>Install Neurativo</strong> for quick access and offline support.
                            </span>
                            <button
                                style={{ padding: '5px 12px', background: '#0369a1', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, flexShrink: 0 }}
                                onClick={async () => {
                                    if (window._pwaInstallPrompt) {
                                        window._pwaInstallPrompt.prompt();
                                        await window._pwaInstallPrompt.userChoice;
                                        window._pwaInstallPrompt = null;
                                    }
                                    sessionStorage.setItem('pwa_banner_dismissed', '1');
                                    setPwaBannerDismissed(true);
                                }}>
                                Install
                            </button>
                            <button className="db-announcement-dismiss" onClick={() => { sessionStorage.setItem('pwa_banner_dismissed', '1'); setPwaBannerDismissed(true); }} aria-label="Dismiss">×</button>
                        </div>
                    )}
                    {announcements
                        .filter(a => !dismissedIds.includes(a.id))
                        .map(a => (
                            <div key={a.id} className={`db-announcement db-announcement-${a.ann_type || 'info'}`}>
                                <span>{a.text}</span>
                                <button className="db-announcement-dismiss" onClick={() => dismissAnnouncement(a.id)} aria-label="Dismiss">×</button>
                            </div>
                        ))
                    }
                    {credits?.low_credits && (
                        <div className="db-announcement db-announcement-warning" style={{ marginBottom: 12 }}>
                            <span>
                                You have <strong>{credits.credits} credit{credits.credits !== 1 ? 's' : ''}</strong> remaining — each lecture uses 1 credit.{' '}
                                <Link to="/credits" style={{ color: 'inherit', fontWeight: 600 }}>Buy more →</Link>
                            </span>
                        </div>
                    )}
                    {credits?.credits === 0 && (
                        <div className="db-announcement db-announcement-maintenance" style={{ marginBottom: 12 }}>
                            <span>
                                You're out of credits. New lectures won't be processed until you add more.{' '}
                                <Link to="/credits" style={{ color: 'inherit', fontWeight: 600 }}>Get credits →</Link>
                            </span>
                        </div>
                    )}
                    <h1 className="db-page-title">Your lectures</h1>
                    <p className="db-page-sub">{loading ? '' : `${lectures.length} ${lectureWord}`}</p>

                    {/* Beta testing banner */}
                    {(() => {
                        const appStatus = betaApplication?.status;
                        const expiresAt = betaApplication?.expires_at;
                        const daysLeft = expiresAt
                            ? Math.max(0, Math.ceil((new Date(expiresAt) - new Date()) / 86400000))
                            : null;
                        const isExpired = expiresAt && new Date(expiresAt) < new Date();

                        if (appStatus === 'approved' && isExpired && !betaBannerDismissed) {
                            return (
                                <div className="db-beta-banner expired">
                                    <span className="db-beta-banner-text">Beta ended — thanks for helping us improve!</span>
                                    <button className="db-beta-dismiss" onClick={() => { setBetaBannerDismissed(true); sessionStorage.setItem('beta_banner_dismissed', '1'); }} aria-label="Dismiss">×</button>
                                </div>
                            );
                        }
                        if (appStatus === 'approved' && !isExpired) {
                            return (
                                <div className="db-beta-banner active">
                                    <span className="db-beta-banner-dot" />
                                    <span className="db-beta-banner-text">
                                        <strong>Beta active</strong> · Student plan · {daysLeft !== null ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining` : ''}
                                    </span>
                                </div>
                            );
                        }
                        if (appStatus === 'pending') {
                            return (
                                <div className="db-beta-banner pending">
                                    <span className="db-beta-banner-text">Beta application received — review in progress.</span>
                                </div>
                            );
                        }
                        if (betaEnabled && !appStatus && betaApplication !== undefined && appStatus !== 'rejected') {
                            return (
                                <div className="db-beta-banner open">
                                    <span className="db-beta-banner-dot" />
                                    <span className="db-beta-banner-text">
                                        <strong>Beta Testing Open</strong> — get 1 free week of Student plan.
                                    </span>
                                    <button className="db-beta-apply" onClick={() => setBetaModalOpen(true)}>Apply now</button>
                                </div>
                            );
                        }
                        return null;
                    })()}

                    {betaModalOpen && (
                        <BetaApplyModal
                            onClose={() => {
                                setBetaModalOpen(false);
                                // Re-fetch application status after modal closes
                                api.get('/api/v1/beta/me').then(r => setBetaApplication(r.data || null)).catch(() => {});
                            }}
                            user={user}
                            initialApplication={betaApplication || null}
                        />
                    )}

                    {/* Processing imports */}
                    {!loading && processingLectures.length > 0 && (
                        <div className="db-proc-section">
                            <p className="db-proc-section-label">Importing</p>
                            <div className="db-proc-grid">
                                {processingLectures.map(l => (
                                    <ProcessingCard
                                        key={l.id}
                                        lecture={l}
                                        statusKey={jobStatuses[l.id] || l.summary_status}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Search */}
                    <div className={`db-search-wrap${searchLoading ? ' db-search-loading' : ''}`}>
                        <span className="db-search-icon">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                        </span>
                        <input
                            ref={searchRef}
                            className="db-search"
                            type="text"
                            value={search}
                            onChange={e => {
                                const val = e.target.value;
                                setSearch(val);
                                clearTimeout(searchTimerRef.current);
                                clearTimeout(semanticTimerRef.current);
                                if (val.trim().length >= 3) {
                                    setSearchLoading(true);
                                    searchTimerRef.current = setTimeout(async () => {
                                        try {
                                            const res = await api.get(`/api/v1/lectures?limit=50&q=${encodeURIComponent(val.trim())}`);
                                            const list = Array.isArray(res.data) ? res.data : [];
                                            setSearchResults(list);
                                        } catch {
                                            setSearchResults([]);
                                        } finally {
                                            setSearchLoading(false);
                                        }
                                    }, 400);
                                } else {
                                    setSearchResults(null);
                                    setSearchLoading(false);
                                }
                                // Semantic search for queries ≥ 4 words
                                if (val.trim().split(/\s+/).filter(Boolean).length >= 4) {
                                    semanticTimerRef.current = setTimeout(async () => {
                                        try {
                                            const res = await api.post('/api/v1/search', { query: val.trim() });
                                            setSemanticResults(res.data.results || []);
                                        } catch {
                                            setSemanticResults(null);
                                        }
                                    }, 600);
                                } else {
                                    setSemanticResults(null);
                                }
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Escape') {
                                    setSearch('');
                                    setSearchResults(null);
                                    setSemanticResults(null);
                                    setSearchLoading(false);
                                    clearTimeout(searchTimerRef.current);
                                    clearTimeout(semanticTimerRef.current);
                                    e.target.blur();
                                }
                            }}
                            placeholder="Search lectures by title, topic or content…"
                        />
                    </div>

                    {/* Filters */}
                    <div className="db-filters">
                        {topics.length > 0 && (
                            <select className="db-filter-select" value={topicFilter} onChange={e => setTopicFilter(e.target.value)}>
                                <option value="">All topics</option>
                                {topics.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        )}
                        {languages.length > 0 && (
                            <select className="db-filter-select" value={langFilter} onChange={e => setLangFilter(e.target.value)}>
                                <option value="">All languages</option>
                                {languages.map(l => <option key={l} value={l}>{langName(l)}</option>)}
                            </select>
                        )}
                        <select className="db-filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ marginLeft: 'auto' }}>
                            <option value="newest">Newest first</option>
                            <option value="oldest">Oldest first</option>
                            <option value="az">A → Z</option>
                        </select>
                        {hasFilters && (
                            <button className="db-filter-clear" onClick={() => { setTopicFilter(''); setLangFilter(''); }}>
                                Clear filters
                            </button>
                        )}
                    </div>

                    {/* AI Match section — semantic search results */}
                    {semanticResults && semanticResults.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ background: '#6366f1', color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>AI</span>
                                Semantic matches
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {semanticResults.map(r => (
                                    <a key={r.lecture_id} href={`/lecture/${r.lecture_id}`}
                                        style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 12, background: 'var(--color-card)', textDecoration: 'none', transition: 'box-shadow 0.15s' }}
                                        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 10px rgba(99,102,241,0.15)'}
                                        onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title || 'Untitled'}</div>
                                            {r.snippet && <div style={{ fontSize: 12, color: 'var(--color-sec)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.snippet}</div>}
                                        </div>
                                        <div style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#6366f1', background: '#f0f0fe', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                                            {Math.round(r.score * 100)}% match
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Content */}
                    {loading ? (
                        <div className="db-grid">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="db-skeleton">
                                    <div className="db-skeleton-line" style={{ width: '55%', marginBottom: 12 }} />
                                    <div className="db-skeleton-line" style={{ width: '80%' }} />
                                    <div className="db-skeleton-line" style={{ width: '65%' }} />
                                    <div className="db-skeleton-line" style={{ width: '90%' }} />
                                </div>
                            ))}
                        </div>
                    ) : lectures.length === 0 ? (
                        <div className="db-empty">
                            <div className="db-empty-num">00</div>
                            <p className="db-empty-title">No lectures yet</p>
                            <p className="db-empty-sub">Start recording your first lecture</p>
                            <button className="db-btn-start" onClick={() => navigate('/record')}>New Lecture</button>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="db-no-match">
                            No lectures match your search
                            <button className="db-no-match-clear" onClick={() => { setSearch(''); setTopicFilter(''); setLangFilter(''); }}>
                                Clear all filters
                            </button>
                        </div>
                    ) : (
                        <div className="db-grid">
                            {filtered.map(l => (
                                <LectureCard
                                    key={l.id}
                                    lecture={l}
                                    onDelete={id => setDeleteId(id)}
                                    onShare={handleShare}
                                    onExport={handleExport}
                                />
                            ))}
                        </div>
                    )}
                </main>

                {/* Onboarding modal */}
                {showOnboarding && (
                    <OnboardingModal onDone={() => setShowOnboarding(false)} />
                )}

                {/* Import modal */}
                {importOpen && (
                    <ImportModal onClose={() => setImportOpen(false)} onImportStarted={handleImportStarted} />
                )}

                {/* Export modal */}
                {exportId && (
                    <ExportModal lectureId={exportId} onClose={() => setExportId(null)} />
                )}

                {/* Delete modal */}
                {deleteId && (
                    <div className="db-modal-overlay" onClick={() => !deleting && setDeleteId(null)}>
                        <div className="db-modal" onClick={e => e.stopPropagation()}>
                            <p className="db-modal-title">Delete this lecture?</p>
                            <p className="db-modal-sub">This will permanently delete the transcript, summary, and all associated data. This cannot be undone.</p>
                            <div className="db-modal-btns">
                                <button className="db-btn-ghost" onClick={() => setDeleteId(null)} disabled={deleting}>Cancel</button>
                                <button className="db-btn-danger" onClick={handleDelete} disabled={deleting}>
                                    {deleting ? 'Deleting…' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <Footer />
        </>
    );
}
