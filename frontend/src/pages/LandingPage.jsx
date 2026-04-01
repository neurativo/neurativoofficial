import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useClerk } from '@clerk/react';
import { useAuthModal } from '../components/AuthModal';
import { useSEO } from '../lib/useSEO';

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
  .lp *, .lp *::before, .lp *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .lp { font-family: 'Inter', sans-serif; background: #fafaf9; color: #1a1a1a; -webkit-font-smoothing: antialiased; }

  /* ── NAV ── */
  .lp-nav {
    position: sticky; top: 0; z-index: 50; height: 60px;
    background: rgba(250,250,249,0.92); backdrop-filter: blur(16px);
    border-bottom: 1px solid #f0ede8;
    display: flex; align-items: center; padding: 0 40px;
  }
  .lp-nav-logo { display: flex; align-items: center; gap: 8px; text-decoration: none; flex-shrink: 0; }
  .lp-nav-logo-icon {
    width: 26px; height: 26px; background: #1a1a1a; border-radius: 7px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .lp-nav-wordmark { font-size: 15px; font-weight: 600; color: #1a1a1a; letter-spacing: -0.3px; }
  .lp-nav-center {
    position: absolute; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 28px;
  }
  .lp-nav-lnk { font-size: 13px; font-weight: 400; color: #6b6b6b; text-decoration: none; transition: color 0.15s; }
  .lp-nav-lnk:hover { color: #1a1a1a; }
  .lp-nav-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
  .lp-btn-ghost-sm {
    font-size: 13px; font-weight: 400; color: #6b6b6b; background: none; border: none;
    cursor: pointer; padding: 6px 12px; border-radius: 8px; text-decoration: none;
    transition: background 0.15s, color 0.15s;
  }
  .lp-btn-ghost-sm:hover { background: #f0ede8; color: #1a1a1a; }
  .lp-btn-dark-sm {
    font-size: 13px; font-weight: 500; color: #fafaf9; background: #1a1a1a; border: none;
    cursor: pointer; padding: 7px 16px; border-radius: 10px; text-decoration: none;
    transition: opacity 0.15s; display: inline-block;
  }
  .lp-btn-dark-sm:hover { opacity: 0.8; }

  /* ── NAV AVATAR / DROPDOWN ── */
  .lp-avatar-wrap { position: relative; }
  .lp-avatar {
    width: 32px; height: 32px; border-radius: 50%; background: #1a1a1a; color: #fafaf9;
    font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center;
    cursor: pointer; border: none; transition: opacity 0.15s; font-family: inherit; flex-shrink: 0;
  }
  .lp-avatar:hover { opacity: 0.8; }
  .lp-nav-dropdown {
    position: absolute; right: 0; top: 42px; z-index: 100; background: #fff;
    border: 1px solid #f0ede8; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.08);
    width: 210px; overflow: hidden; animation: lp-dd-in 0.15s ease;
  }
  @keyframes lp-dd-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  .lp-nav-dd-head { padding: 12px 14px; border-bottom: 1px solid #f0ede8; }
  .lp-nav-dd-label { font-size: 11px; color: #a3a3a3; margin-bottom: 2px; }
  .lp-nav-dd-email { font-size: 12px; font-weight: 500; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lp-nav-dd-item {
    display: block; width: 100%; text-align: left; padding: 9px 14px; font-size: 13px;
    color: #6b6b6b; background: none; border: none; font-family: inherit; cursor: pointer;
    transition: background 0.12s; text-decoration: none;
  }
  .lp-nav-dd-item:hover { background: #fafaf9; color: #1a1a1a; }
  .lp-nav-dd-divider { height: 1px; background: #f0ede8; }
  .lp-nav-dd-signout {
    display: block; width: 100%; text-align: left; padding: 9px 14px; font-size: 13px;
    color: #ef4444; background: none; border: none; cursor: pointer; font-family: inherit;
    transition: background 0.12s;
  }
  .lp-nav-dd-signout:hover { background: #fff5f5; }

  /* ── HERO ── */
  .lp-hero {
    padding: 100px 40px 80px;
    display: flex; flex-direction: column; align-items: center; text-align: center;
  }
  .lp-eyebrow {
    display: inline-flex; align-items: center; gap: 7px;
    font-size: 11px; font-weight: 500; letter-spacing: 1px; text-transform: uppercase;
    color: #a3a3a3; border: 1px solid #f0ede8; background: #fff;
    padding: 5px 14px; border-radius: 100px; margin-bottom: 28px;
  }
  .lp-eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex-shrink: 0; }
  .lp-h1 {
    font-size: 52px; font-weight: 600; letter-spacing: -2px; line-height: 1.08;
    color: #1a1a1a; max-width: 720px; margin-bottom: 20px;
    font-family: 'Inter', sans-serif;
  }
  .lp-h1-em { color: #6b6b6b; font-style: italic; font-weight: 400; }
  .lp-hero-sub {
    font-size: 16px; font-weight: 400; line-height: 1.7;
    color: #6b6b6b; max-width: 480px; margin-bottom: 36px;
  }
  .lp-hero-btns {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 32px; flex-wrap: wrap; justify-content: center;
  }
  .lp-btn-dark-md {
    font-size: 14px; font-weight: 500; color: #fafaf9; background: #1a1a1a; border: none;
    cursor: pointer; padding: 11px 22px; border-radius: 10px; text-decoration: none;
    display: inline-flex; align-items: center; gap: 6px; transition: opacity 0.15s;
  }
  .lp-btn-dark-md:hover { opacity: 0.82; }
  .lp-btn-ghost-md {
    font-size: 14px; font-weight: 400; color: #6b6b6b; background: #fff;
    border: 1px solid #f0ede8; cursor: pointer; padding: 10px 22px; border-radius: 10px;
    text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
    transition: border-color 0.15s, color 0.15s;
  }
  .lp-btn-ghost-md:hover { border-color: #e8e4de; color: #1a1a1a; }
  .lp-proof { font-size: 13px; color: #c8c4be; }

  /* ── MOCKUP ── */
  .lp-mockup-wrap { padding: 0 40px 80px; max-width: 960px; margin: 0 auto; }
  .lp-browser {
    border: 1px solid #f0ede8; border-radius: 14px; overflow: hidden;
    background: #fff; box-shadow: 0 8px 48px rgba(0,0,0,0.06);
  }
  .lp-browser-bar {
    height: 44px; background: #f5f3f0; border-bottom: 1px solid #f0ede8;
    display: flex; align-items: center; padding: 0 16px; gap: 14px;
  }
  .lp-browser-dots { display: flex; gap: 6px; }
  .lp-browser-dot { width: 10px; height: 10px; border-radius: 50%; }
  .lp-url-bar {
    flex: 1; max-width: 300px; height: 24px; background: #eceae6; border-radius: 6px;
    display: flex; align-items: center; padding: 0 10px; gap: 5px; margin: 0 auto;
  }
  .lp-url-text { font-size: 11px; color: #a3a3a3; font-family: monospace; }
  .lp-browser-body { display: grid; grid-template-columns: 1fr 1fr; height: 300px; }
  .lp-t-panel {
    border-right: 1px solid #f0ede8; padding: 16px;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .lp-s-panel { padding: 16px; display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
  .lp-panel-lbl {
    font-size: 11px; font-weight: 500; letter-spacing: 1px; text-transform: uppercase;
    color: #a3a3a3; margin-bottom: 10px;
  }
  .lp-live-badge {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 10px; font-weight: 500; color: #ef4444;
    letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 8px;
  }
  .lp-live-dot {
    width: 5px; height: 5px; border-radius: 50%; background: #ef4444;
    animation: lp-rec-pulse 1.4s ease-in-out infinite;
  }
  @keyframes lp-rec-pulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
  .lp-seg {
    font-size: 12.5px; color: #6b6b6b; line-height: 1.55;
    padding: 6px 8px; border-radius: 6px; border-left: 3px solid transparent;
    margin-bottom: 4px;
  }
  .lp-seg.live { border-left-color: #1a1a1a; background: #fafaf9; color: #1a1a1a; }
  .lp-sum-card {
    border: 1px solid #f0ede8; border-radius: 10px; padding: 10px 12px; background: #fff;
  }
  .lp-sum-title { font-size: 12px; font-weight: 500; color: #1a1a1a; margin-bottom: 5px; letter-spacing: -0.2px; }
  .lp-sum-body { font-size: 11.5px; color: #6b6b6b; line-height: 1.55; margin-bottom: 8px; }
  .lp-pills { display: flex; flex-wrap: wrap; gap: 4px; }
  .lp-pill {
    font-size: 10.5px; padding: 2px 8px; border-radius: 20px;
    background: #E6F1FB; color: #185FA5; border: 1px solid #B5D4F4;
  }

  /* ── STATS ── */
  .lp-stats-wrap { padding: 0 40px 80px; max-width: 960px; margin: 0 auto; }
  .lp-stats-grid {
    display: grid; grid-template-columns: repeat(4, 1fr);
    border: 1px solid #f0ede8; border-radius: 14px; overflow: hidden; background: #fff;
  }
  .lp-stat { padding: 28px 20px; text-align: center; border-right: 1px solid #f0ede8; }
  .lp-stat:last-child { border-right: none; }
  .lp-stat-n {
    font-family: monospace; font-size: 34px; font-weight: 600; color: #1a1a1a;
    letter-spacing: -1.5px; line-height: 1; margin-bottom: 6px;
  }
  .lp-stat-l { font-size: 12px; color: #a3a3a3; }

  /* ── SECTION WRAPPER ── */
  .lp-sec { padding: 0 40px 80px; max-width: 960px; margin: 0 auto; }
  .lp-sec-eye {
    font-size: 11px; font-weight: 500; letter-spacing: 1px; text-transform: uppercase;
    color: #a3a3a3; margin-bottom: 10px;
  }
  .lp-sec-h2 {
    font-size: 36px; font-weight: 600; letter-spacing: -1.2px; line-height: 1.15;
    color: #1a1a1a; margin-bottom: 10px; font-family: 'Inter', sans-serif;
  }
  .lp-sec-sub {
    font-size: 15px; color: #6b6b6b; line-height: 1.7; max-width: 480px; margin-bottom: 40px;
  }

  /* ── FEATURES ── */
  .lp-feat-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 1px; background: #f0ede8;
    border: 1px solid #f0ede8; border-radius: 14px; overflow: hidden;
  }
  .lp-feat-cell { background: #fff; padding: 28px; transition: background 0.15s; }
  .lp-feat-cell:hover { background: #fafaf9; }
  .lp-feat-icon {
    width: 34px; height: 34px; border-radius: 9px; border: 1px solid #f0ede8;
    background: #fff; display: flex; align-items: center; justify-content: center;
    margin-bottom: 14px; color: #1a1a1a; flex-shrink: 0;
  }
  .lp-feat-title { font-size: 14px; font-weight: 500; color: #1a1a1a; letter-spacing: -0.2px; margin-bottom: 6px; }
  .lp-feat-desc { font-size: 13px; color: #6b6b6b; line-height: 1.65; }

  /* ── HOW IT WORKS ── */
  .lp-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .lp-step {
    border: 1px solid #f0ede8; border-radius: 14px; background: #fff;
    padding: 28px; transition: border-color 0.15s;
  }
  .lp-step:hover { border-color: #e8e4de; }
  .lp-step-n { font-family: monospace; font-size: 12px; color: #a3a3a3; margin-bottom: 20px; }
  .lp-step-title { font-size: 15px; font-weight: 500; color: #1a1a1a; letter-spacing: -0.3px; margin-bottom: 8px; }
  .lp-step-desc { font-size: 13px; color: #6b6b6b; line-height: 1.65; }

  /* ── PRICING ── */
  .lp-pricing { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; align-items: start; }
  .lp-plan { border: 1px solid #f0ede8; border-radius: 14px; background: #fff; padding: 28px; }
  .lp-plan-feat { border: 1.5px solid #1a1a1a; border-radius: 14px; background: #fafaf9; padding: 28px; }
  .lp-plan-badge {
    display: inline-block; font-size: 10px; font-weight: 500; letter-spacing: 0.8px;
    text-transform: uppercase; color: #fafaf9; background: #1a1a1a;
    padding: 3px 10px; border-radius: 100px; margin-bottom: 16px;
  }
  .lp-plan-name { font-size: 14px; font-weight: 500; color: #1a1a1a; margin-bottom: 4px; letter-spacing: -0.2px; }
  .lp-plan-tagline { font-size: 13px; color: #6b6b6b; line-height: 1.5; margin-bottom: 20px; }
  .lp-price-row { display: flex; align-items: baseline; gap: 3px; margin-bottom: 2px; }
  .lp-price-sign { font-size: 16px; color: #6b6b6b; align-self: flex-start; margin-top: 6px; }
  .lp-price-big {
    font-size: 34px; font-weight: 600; color: #1a1a1a;
    letter-spacing: -2px; line-height: 1; font-family: 'Inter', sans-serif;
  }
  .lp-price-mo { font-size: 12px; color: #a3a3a3; margin-bottom: 4px; }
  .lp-price-lkr { font-size: 12px; color: #c0bdb8; margin-bottom: 16px; }
  .lp-plan-div { height: 1px; background: #f0ede8; margin: 20px 0; }
  .lp-plan-items { list-style: none; margin-bottom: 24px; display: flex; flex-direction: column; gap: 9px; }
  .lp-plan-item { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: #6b6b6b; line-height: 1.45; }
  .lp-check { color: #1a1a1a; flex-shrink: 0; margin-top: 1px; }
  .lp-btn-plan-dark {
    display: block; width: 100%; text-align: center; font-size: 13px; font-weight: 500;
    color: #fafaf9; background: #1a1a1a; border: none; cursor: pointer;
    padding: 10px; border-radius: 10px; text-decoration: none; transition: opacity 0.15s;
  }
  .lp-btn-plan-dark:hover { opacity: 0.82; }
  .lp-btn-plan-outline {
    display: block; width: 100%; text-align: center; font-size: 13px; font-weight: 400;
    color: #1a1a1a; background: #fff; border: 1px solid #f0ede8; cursor: pointer;
    padding: 10px; border-radius: 10px; text-decoration: none; transition: border-color 0.15s;
  }
  .lp-btn-plan-outline:hover { border-color: #e8e4de; }

  /* ── CTA ── */
  .lp-cta-wrap { padding: 0 40px 80px; }
  .lp-cta {
    background: #1a1a1a; border-radius: 18px; padding: 64px 40px;
    text-align: center; display: flex; flex-direction: column; align-items: center;
  }
  .lp-cta-h2 {
    font-size: 36px; font-weight: 600; color: #fafaf9; letter-spacing: -1.2px;
    line-height: 1.15; margin-bottom: 12px; max-width: 560px;
    font-family: 'Inter', sans-serif;
  }
  .lp-cta-sub { font-size: 15px; color: #6b6b6b; line-height: 1.7; margin-bottom: 28px; max-width: 380px; }
  .lp-btn-light {
    font-size: 14px; font-weight: 500; color: #1a1a1a; background: #fafaf9; border: none;
    cursor: pointer; padding: 11px 26px; border-radius: 10px; text-decoration: none;
    transition: opacity 0.15s; display: inline-block;
  }
  .lp-btn-light:hover { opacity: 0.88; }

  /* ── ABOUT ── */
  .lp-about-quote {
    border-left: 2px solid #1a1a1a; padding-left: 20px; margin-bottom: 44px;
  }
  .lp-about-quote-text {
    font-size: 28px; font-weight: 600; color: #1a1a1a;
    letter-spacing: -0.8px; line-height: 1.25; margin-bottom: 8px;
  }
  .lp-about-quote-sub { font-size: 14px; color: #a3a3a3; line-height: 1.6; }
  .lp-about-cols {
    display: grid; grid-template-columns: 1fr 1fr; gap: 1px;
    background: #f0ede8; border: 1px solid #f0ede8;
    border-radius: 14px; overflow: hidden; margin-bottom: 28px;
  }
  .lp-about-col { background: #fff; padding: 28px; }
  .lp-about-col-label {
    font-size: 10px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase;
    color: #a3a3a3; margin-bottom: 12px;
  }
  .lp-about-col-text { font-size: 13.5px; color: #6b6b6b; line-height: 1.8; }
  .lp-about-founders {
    font-size: 12px; color: #a3a3a3;
    border-top: 1px solid #f0ede8; padding-top: 20px;
  }
  .lp-about-founders span { color: #6b6b6b; }
  @media (max-width: 640px) {
    .lp-about-cols { grid-template-columns: 1fr; }
    .lp-about-quote-text { font-size: 22px; }
  }

  /* ── FOOTER ── */
  .lp-footer {
    border-top: 1px solid #f0ede8; padding: 36px 40px;
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 24px;
  }
  .lp-footer-brand-wrap { display: flex; align-items: center; gap: 8px; text-decoration: none; }
  .lp-footer-icon {
    width: 22px; height: 22px; border-radius: 6px; background: #1a1a1a;
    display: flex; align-items: center; justify-content: center;
  }
  .lp-footer-name { font-size: 14px; font-weight: 600; color: #1a1a1a; letter-spacing: -0.3px; }
  .lp-footer-lnks { display: flex; gap: 24px; align-items: center; }
  .lp-footer-lnk { font-size: 13px; color: #a3a3a3; text-decoration: none; transition: color 0.15s; }
  .lp-footer-lnk:hover { color: #1a1a1a; }
  .lp-footer-copy { font-size: 12px; color: #a3a3a3; text-align: right; }

  /* ── N.A.S.T. ── */
  .lp-nast-wrap { padding: 0 40px 80px; max-width: 960px; margin: 0 auto; }
  .lp-nast-inner {
    background: #111; border-radius: 20px; padding: 52px 48px;
    display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center;
  }
  .lp-nast-left {}
  .lp-nast-badge {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 10px; font-weight: 600; letter-spacing: 1.2px; text-transform: uppercase;
    color: rgba(255,255,255,0.35); border: 1px solid rgba(255,255,255,0.1);
    padding: 4px 12px; border-radius: 100px; margin-bottom: 20px;
  }
  .lp-nast-badge-dot { width: 5px; height: 5px; border-radius: 50%; background: #22c55e; flex-shrink: 0; }
  .lp-nast-h2 {
    font-size: 30px; font-weight: 600; color: #fafaf9; letter-spacing: -1px;
    line-height: 1.2; margin-bottom: 14px; font-family: 'Inter', sans-serif;
  }
  .lp-nast-h2 span { color: rgba(255,255,255,0.38); }
  .lp-nast-sub { font-size: 14px; color: rgba(255,255,255,0.45); line-height: 1.75; max-width: 360px; }

  /* Right: signal visualiser */
  .lp-nast-right { display: flex; flex-direction: column; gap: 18px; }
  .lp-nast-signal {}
  .lp-nast-signal-head {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px;
  }
  .lp-nast-signal-name { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.55); letter-spacing: 0.2px; }
  .lp-nast-signal-val { font-size: 12px; font-family: monospace; color: rgba(255,255,255,0.35); }
  .lp-nast-bar-bg { width: 100%; height: 5px; background: rgba(255,255,255,0.08); border-radius: 99px; overflow: hidden; }
  .lp-nast-bar-fill { height: 100%; border-radius: 99px; transition: width 1.4s cubic-bezier(0.16, 1, 0.3, 1); }

  /* Composite */
  .lp-nast-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0; }
  .lp-nast-composite-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px; }
  .lp-nast-composite-label { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.75); letter-spacing: 0.3px; }
  .lp-nast-composite-val { font-size: 13px; font-family: monospace; font-weight: 600; color: #22c55e; }
  .lp-nast-composite-bar-bg { width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 99px; overflow: hidden; }
  .lp-nast-composite-fill { height: 100%; background: #22c55e; border-radius: 99px; transition: width 1.8s cubic-bezier(0.16, 1, 0.3, 1); }
  .lp-nast-trigger {
    display: inline-flex; align-items: center; gap: 6px; margin-top: 12px;
    font-size: 11px; font-weight: 500; color: #22c55e; letter-spacing: 0.3px;
  }
  .lp-nast-trigger-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; animation: lp-rec-pulse 1.4s ease-in-out infinite; }

  @media (max-width: 768px) {
    .lp-nast-wrap { padding: 0 24px 60px; }
    .lp-nast-inner { grid-template-columns: 1fr; padding: 32px 24px; gap: 32px; }
    .lp-nast-h2 { font-size: 24px; }
  }

  /* ── UNIVERSITY BAR ── */
  .lp-uni-bar { padding: 0 40px 60px; }
  .lp-uni-bar-inner { border-top: 1px solid #f0ede8; border-bottom: 1px solid #f0ede8; padding: 20px 0; display: flex; align-items: center; gap: 32px; overflow: hidden; }
  .lp-uni-label { font-size: 11px; font-weight: 500; letter-spacing: 0.8px; text-transform: uppercase; color: #c8c4be; flex-shrink: 0; }
  .lp-uni-names { display: flex; gap: 28px; flex-wrap: wrap; }
  .lp-uni-name { font-size: 13px; font-weight: 500; color: #c8c4be; white-space: nowrap; }

  /* ── TESTIMONIALS ── */
  .lp-testi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .lp-testi-card { background: #fff; border: 1px solid #f0ede8; border-radius: 14px; padding: 24px; transition: border-color 0.15s; }
  .lp-testi-card:hover { border-color: #e8e4de; }
  .lp-testi-quote { font-size: 13px; color: #6b6b6b; line-height: 1.7; margin-bottom: 16px; font-style: italic; }
  .lp-testi-author { display: flex; align-items: center; gap: 10px; }
  .lp-testi-avatar { width: 32px; height: 32px; border-radius: 50%; background: #1a1a1a; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: #fafaf9; flex-shrink: 0; }
  .lp-testi-name { font-size: 13px; font-weight: 500; color: #1a1a1a; letter-spacing: -0.1px; }
  .lp-testi-school { font-size: 11px; color: #a3a3a3; }
  .lp-testi-stars { display: flex; gap: 2px; margin-bottom: 12px; }
  .lp-testi-star { color: #f59e0b; font-size: 12px; }

  /* ── FAQ ── */
  .lp-faq { display: flex; flex-direction: column; gap: 0; border: 1px solid #f0ede8; border-radius: 14px; overflow: hidden; background: #fff; }
  .lp-faq-item { border-bottom: 1px solid #f0ede8; }
  .lp-faq-item:last-child { border-bottom: none; }
  .lp-faq-q { width: 100%; text-align: left; padding: 18px 20px; font-size: 14px; font-weight: 500; color: #1a1a1a; background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 12px; transition: background 0.12s; font-family: 'Inter', sans-serif; }
  .lp-faq-q:hover { background: #fafaf9; }
  .lp-faq-chevron { flex-shrink: 0; color: #a3a3a3; transition: transform 0.2s; }
  .lp-faq-chevron.open { transform: rotate(180deg); }
  .lp-faq-a { padding: 0 20px 18px; font-size: 13px; color: #6b6b6b; line-height: 1.7; }

  /* ── MOBILE HAMBURGER ── */
  .lp-hamburger { display: none; background: none; border: none; cursor: pointer; color: #6b6b6b; padding: 4px; margin-left: 8px; }
  .lp-mobile-menu {
    display: none; position: absolute; top: 60px; left: 0; right: 0; z-index: 49;
    background: rgba(250,250,249,0.97); border-bottom: 1px solid #f0ede8;
    padding: 16px 24px 20px; flex-direction: column; gap: 4px;
    backdrop-filter: blur(16px);
  }
  .lp-mobile-menu.open { display: flex; }
  .lp-mobile-menu-lnk { font-size: 15px; color: #1a1a1a; text-decoration: none; padding: 10px 0; border-bottom: 1px solid #f0ede8; }
  .lp-mobile-menu-lnk:last-child { border-bottom: none; }

  /* ── MOBILE ── */
  @media (max-width: 768px) {
    .lp-nav { padding: 0 20px; position: relative; }
    .lp-nav-center { display: none; }
    .lp-hamburger { display: block; }
    .lp-btn-ghost-sm { display: none; } /* hide ghost "Sign in" on mobile — it's in the hamburger menu */

    .lp-hero { padding: 70px 24px 60px; }
    .lp-h1 { font-size: 36px; letter-spacing: -1.2px; }
    .lp-hero-sub { font-size: 15px; }
    .lp-hero-btns { flex-direction: column; align-items: stretch; width: 100%; max-width: 320px; }
    .lp-btn-dark-md, .lp-btn-ghost-md { justify-content: center; }

    .lp-mockup-wrap { display: none; }

    .lp-stats-wrap { padding: 0 24px 60px; }
    .lp-stats-grid { grid-template-columns: repeat(2, 1fr); }
    .lp-stat:nth-child(2) { border-right: none; }
    .lp-stat:nth-child(3) { border-top: 1px solid #f0ede8; }
    .lp-stat:nth-child(4) { border-top: 1px solid #f0ede8; border-right: none; }

    .lp-sec { padding: 0 24px 60px; }
    .lp-feat-grid { grid-template-columns: 1fr; gap: 0; }
    .lp-feat-cell:not(:last-child) { border-bottom: 1px solid #f0ede8; }
    .lp-steps { grid-template-columns: 1fr; }
    .lp-pricing { grid-template-columns: 1fr; }
    .lp-plan-feat { order: -1; }
    .lp-uni-bar { padding: 0 24px 48px; }
    .lp-testi-grid { grid-template-columns: 1fr; }
    .lp-uni-names { gap: 16px; }

    .lp-cta-wrap { padding: 0 24px 60px; }
    .lp-cta { padding: 40px 24px; }
    .lp-cta-h2 { font-size: 26px; letter-spacing: -0.8px; }

    .lp-footer { grid-template-columns: 1fr; text-align: center; justify-items: center; padding: 28px 24px; gap: 16px; }
    .lp-footer-copy { text-align: center; }
  }

  @media (max-width: 480px) {
    .lp-nav { padding: 0 16px; }
    .lp-hero { padding: 56px 16px 48px; }
    .lp-h1 { font-size: 30px; letter-spacing: -1px; }
    .lp-hero-sub { font-size: 14px; }
    .lp-hero-eyebrow { font-size: 10px; }
    .lp-stats-wrap { padding: 0 16px 48px; }
    .lp-sec { padding: 0 16px 48px; }
    .lp-sec-h2 { font-size: 22px; }
    .lp-sec-sub { font-size: 13px; }
    .lp-nast-wrap { padding: 0 16px 48px; }
    .lp-uni-bar { padding: 0 16px 40px; }
    .lp-cta-wrap { padding: 0 16px 48px; }
    .lp-cta { padding: 32px 20px; border-radius: 18px; }
    .lp-cta-h2 { font-size: 22px; }
    .lp-footer { padding: 24px 16px; }
    .lp-pricing { gap: 12px; }
    .lp-plan, .lp-plan-feat { padding: 24px 20px; }
    .lp-mobile-menu { padding: 12px 16px 16px; }
    .lp-testi-grid { gap: 10px; }
    .lp-testi-card { padding: 18px; }
  }
`;

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconMic = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
);
const IconLayers = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
    </svg>
);
const IconChat = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
);
const IconBulb = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/>
        <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
    </svg>
);
const IconDoc = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/>
    </svg>
);
const IconCloud = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
    </svg>
);
const IconArrow = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
);
const IconCheck = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
    </svg>
);
const IconLogo = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fafaf9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
    </svg>
);

// ─── Section sub-components ───────────────────────────────────────────────────

const CYCLE_WORDS = ['wish', 'need', 'deserve', 'wanted'];

function NavAvatar({ user }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const initial = (user?.email?.[0] || '?').toUpperCase();
    const { signOut } = useClerk();

    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleSignOut = async () => {
        await signOut();
        setOpen(false);
    };

    return (
        <div className="lp-avatar-wrap" ref={ref}>
            <button className="lp-avatar" onClick={() => setOpen(o => !o)}>{initial}</button>
            {open && (
                <div className="lp-nav-dropdown">
                    <div className="lp-nav-dd-head">
                        <div className="lp-nav-dd-label">Signed in as</div>
                        <div className="lp-nav-dd-email">{user?.email}</div>
                    </div>
                    <Link to="/app"     className="lp-nav-dd-item" onClick={() => setOpen(false)}>Dashboard</Link>
                    <Link to="/record"  className="lp-nav-dd-item" onClick={() => setOpen(false)}>New lecture</Link>
                    <Link to="/profile" className="lp-nav-dd-item" onClick={() => setOpen(false)}>Profile</Link>
                    <div className="lp-nav-dd-divider" />
                    <button className="lp-nav-dd-signout" onClick={handleSignOut}>Sign out</button>
                </div>
            )}
        </div>
    );
}

function Navbar({ user }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const { openSignIn, openSignUp } = useAuthModal();
    return (
        <nav className="lp-nav">
            <Link to="/" className="lp-nav-logo">
                <img src="/logo.png" alt="Neurativo" style={{ width: 28, height: 28, borderRadius: 7 }} />
                <span className="lp-nav-wordmark">Neurativo</span>
            </Link>
            <div className="lp-nav-center">
                <Link to="/features" className="lp-nav-lnk">Features</Link>
                <Link to="/pricing" className="lp-nav-lnk">Pricing</Link>
                <Link to="/how-it-works" className="lp-nav-lnk">How it works</Link>
                <Link to="/faq" className="lp-nav-lnk">FAQ</Link>
                <Link to="/about" className="lp-nav-lnk">About</Link>
            </div>
            <div className="lp-nav-right">
                {user ? (
                    <>
                        <Link to="/record" className="lp-btn-dark-sm">Start recording</Link>
                        <NavAvatar user={user} />
                    </>
                ) : (
                    <>
                        <button className="lp-btn-ghost-sm" onClick={openSignIn}>Sign in</button>
                        <button className="lp-btn-dark-sm"  onClick={openSignUp}>Get started</button>
                    </>
                )}
                <button className="lp-hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Toggle menu">
                    {menuOpen ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                    )}
                </button>
            </div>
            {/* Mobile menu */}
            <div className={`lp-mobile-menu ${menuOpen ? 'open' : ''}`}>
                <Link to="/features"    className="lp-mobile-menu-lnk" onClick={() => setMenuOpen(false)}>Features</Link>
                <Link to="/pricing"     className="lp-mobile-menu-lnk" onClick={() => setMenuOpen(false)}>Pricing</Link>
                <Link to="/how-it-works" className="lp-mobile-menu-lnk" onClick={() => setMenuOpen(false)}>How it works</Link>
                <Link to="/faq"         className="lp-mobile-menu-lnk" onClick={() => setMenuOpen(false)}>FAQ</Link>
                <Link to="/about"       className="lp-mobile-menu-lnk" onClick={() => setMenuOpen(false)}>About</Link>
                {user
                    ? <Link to="/app" className="lp-mobile-menu-lnk" onClick={() => setMenuOpen(false)}>Dashboard</Link>
                    : <button className="lp-mobile-menu-lnk" onClick={() => { setMenuOpen(false); openSignIn(); }}>Sign in</button>
                }
            </div>
        </nav>
    );
}

function Hero({ user }) {
    const [wordIdx, setWordIdx] = useState(0);
    const [fading, setFading]   = useState(false);
    const { openSignUp } = useAuthModal();
    useEffect(() => {
        const t = setInterval(() => {
            setFading(true);
            setTimeout(() => {
                setWordIdx(i => (i + 1) % CYCLE_WORDS.length);
                setFading(false);
            }, 220);
        }, 2200);
        return () => clearInterval(t);
    }, []);
    return (
        <section className="lp-hero">
            <div className="lp-eyebrow">
                <span className="lp-eyebrow-dot" />
                Now in early access
            </div>
            <h1 className="lp-h1">
                The lecture notes you{' '}
                <em className="lp-h1-em" style={{ transition: 'opacity 0.22s', opacity: fading ? 0 : 1 }}>
                    {CYCLE_WORDS[wordIdx]}
                </em>
                {' '}you had taken
            </h1>
            <p className="lp-hero-sub">
                Neurativo records your lecture, transcribes every word, and builds structured
                summaries in real time — so you can focus on learning, not writing.
            </p>
            <div className="lp-hero-btns">
                {user ? (
                    <Link to="/record" className="lp-btn-dark-md">Start recording <IconArrow /></Link>
                ) : (
                    <button className="lp-btn-dark-md" onClick={openSignUp}>Start recording free <IconArrow /></button>
                )}
                {user
                    ? <Link to="/app" className="lp-btn-ghost-md">Go to dashboard</Link>
                    : <Link to="/how-it-works" className="lp-btn-ghost-md">See how it works</Link>
                }
            </div>
            <p className="lp-proof">Trusted by students at 40+ universities · 10,000+ lectures transcribed</p>
        </section>
    );
}

function NASTSection() {
    const [fired, setFired] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setFired(true); obs.disconnect(); } },
            { threshold: 0.3 }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    const signals = [
        { name: 'Semantic Divergence', val: 0.82, weight: '50%', color: '#818cf8' },
        { name: 'Novelty Drift',       val: 0.61, weight: '30%', color: '#38bdf8' },
        { name: 'Momentum',            val: 0.34, weight: '20%', color: '#fb923c' },
    ];
    const composite = 0.71;

    return (
        <div className="lp-nast-wrap" ref={ref}>
            <div className="lp-nast-inner">
                {/* Left — copy */}
                <div className="lp-nast-left">
                    <div className="lp-nast-badge">
                        <span className="lp-nast-badge-dot" />
                        Proprietary algorithm
                    </div>
                    <h2 className="lp-nast-h2">
                        Summaries that know<br />
                        <span>when the topic changes.</span>
                    </h2>
                    <p className="lp-nast-sub">
                        Most tools split summaries by time. N.A.S.T. — our Neurativo Adaptive Section Trigger — detects genuine topic shifts in real time using three semantic signals. Each section of your summary maps to a real section of thought.
                    </p>
                </div>

                {/* Right — signal visualiser */}
                <div className="lp-nast-right">
                    {signals.map((s) => (
                        <div key={s.name} className="lp-nast-signal">
                            <div className="lp-nast-signal-head">
                                <span className="lp-nast-signal-name">{s.name}</span>
                                <span className="lp-nast-signal-val">{fired ? s.val.toFixed(2) : '0.00'} · {s.weight}</span>
                            </div>
                            <div className="lp-nast-bar-bg">
                                <div
                                    className="lp-nast-bar-fill"
                                    style={{
                                        width: fired ? `${s.val * 100}%` : '0%',
                                        background: s.color,
                                    }}
                                />
                            </div>
                        </div>
                    ))}

                    <div className="lp-nast-divider" />

                    {/* Composite */}
                    <div>
                        <div className="lp-nast-composite-head">
                            <span className="lp-nast-composite-label">Composite score</span>
                            <span className="lp-nast-composite-val">{fired ? composite.toFixed(2) : '0.00'} &gt; 0.55</span>
                        </div>
                        <div className="lp-nast-composite-bar-bg">
                            <div
                                className="lp-nast-composite-fill"
                                style={{ width: fired ? `${composite * 100}%` : '0%' }}
                            />
                        </div>
                        {fired && (
                            <div className="lp-nast-trigger">
                                <span className="lp-nast-trigger-dot" />
                                Section boundary triggered — summary generated
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function UniversityBar() {
    const unis = ['MIT', 'Stanford', 'UCL', 'Imperial College', 'ETH Zürich', 'NUS', 'University of Toronto', "King's College"];
    return (
        <div className="lp-uni-bar">
            <div className="lp-uni-bar-inner">
                <span className="lp-uni-label">Trusted at</span>
                <div className="lp-uni-names">
                    {unis.map(u => <span key={u} className="lp-uni-name">{u}</span>)}
                </div>
            </div>
        </div>
    );
}

function Mockup() {
    return (
        <div className="lp-mockup-wrap">
            <div className="lp-browser">
                {/* Title bar */}
                <div className="lp-browser-bar">
                    <div className="lp-browser-dots">
                        <div className="lp-browser-dot" style={{ background: '#ff5f57' }} />
                        <div className="lp-browser-dot" style={{ background: '#febc2e' }} />
                        <div className="lp-browser-dot" style={{ background: '#28c840' }} />
                    </div>
                    <div className="lp-url-bar">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        <span className="lp-url-text">neurativo.com/record</span>
                    </div>
                </div>
                {/* Body */}
                <div className="lp-browser-body">
                    {/* Transcript panel */}
                    <div className="lp-t-panel">
                        <div className="lp-panel-lbl">Transcript</div>
                        <div className="lp-live-badge">
                            <span className="lp-live-dot" />
                            Live
                        </div>
                        <div className="lp-seg">
                            The cell membrane is a selectively permeable lipid bilayer. It controls what enters and exits the cell using a combination of passive and active transport mechanisms.
                        </div>
                        <div className="lp-seg">
                            Passive transport requires no energy — molecules move down their concentration gradient. Osmosis is a specific type involving water molecules across a semi-permeable membrane.
                        </div>
                        <div className="lp-seg live">
                            Active transport, on the other hand, moves molecules against their gradient and requires ATP. The sodium-potassium pump is the classic example — it maintains cell potential by pumping three Na⁺ out for every two K⁺ in.
                        </div>
                    </div>
                    {/* Summary panel */}
                    <div className="lp-s-panel">
                        <div className="lp-panel-lbl">Summary</div>
                        <div className="lp-sum-card">
                            <div className="lp-sum-title">Cell Membrane Structure</div>
                            <div className="lp-sum-body">
                                Selectively permeable lipid bilayer regulating molecular traffic via passive diffusion and energy-dependent active transport.
                            </div>
                            <div className="lp-pills">
                                <span className="lp-pill">lipid bilayer</span>
                                <span className="lp-pill">selective permeability</span>
                                <span className="lp-pill">osmosis</span>
                            </div>
                        </div>
                        <div className="lp-sum-card">
                            <div className="lp-sum-title">Active vs. Passive Transport</div>
                            <div className="lp-sum-body">
                                Passive transport is gradient-driven; active transport uses ATP to move molecules against their gradient.
                            </div>
                            <div className="lp-pills">
                                <span className="lp-pill">Na⁺/K⁺ pump</span>
                                <span className="lp-pill">ATP</span>
                                <span className="lp-pill">concentration gradient</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatsBar() {
    const stats = [
        { n: '<3s',  l: 'Transcript latency' },
        { n: '3×',   l: 'Faster than manual notes' },
        { n: '99%',  l: 'Transcription accuracy' },
        { n: '10k+', l: 'Lectures transcribed' },
    ];
    return (
        <div className="lp-stats-wrap">
            <div className="lp-stats-grid">
                {stats.map(s => (
                    <div key={s.l} className="lp-stat">
                        <div className="lp-stat-n">{s.n}</div>
                        <div className="lp-stat-l">{s.l}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Features() {
    const feats = [
        { icon: <IconMic />,    title: 'Real-time transcription',    desc: 'Every word captured as it happens, with no perceptible delay. Focus on the lecture — the transcript writes itself.' },
        { icon: <IconLayers />, title: 'Hierarchical summaries',     desc: 'Summaries build progressively as the lecture unfolds — section by section, rolling into a complete master overview.' },
        { icon: <IconChat />,   title: 'AI Q&A',                     desc: 'Ask any question about the lecture. Neurativo finds the most relevant moments and answers directly from your content.' },
        { icon: <IconBulb />,   title: 'Smart Explain',              desc: 'Select any phrase. Get a plain-English explanation, a concrete analogy, and a step-by-step breakdown instantly.' },
        { icon: <IconDoc />,    title: 'One-click PDF export',       desc: 'A polished report with your transcript, summaries, key concepts, and Q&A history — ready to download in seconds.' },
        { icon: <IconCloud />,  title: 'Resilient by design',        desc: 'Recording continues even when your connection drops. Audio is buffered locally and synced automatically when you reconnect.' },
    ];
    return (
        <section id="features" className="lp-sec">
            <div className="lp-sec-eye">Features</div>
            <h2 className="lp-sec-h2">Everything a lecture needs</h2>
            <p className="lp-sec-sub">Built for the pace of live teaching — every feature is designed to work without interrupting your attention.</p>
            <div className="lp-feat-grid">
                {feats.map(f => (
                    <div key={f.title} className="lp-feat-cell">
                        <div className="lp-feat-icon">{f.icon}</div>
                        <div className="lp-feat-title">{f.title}</div>
                        <div className="lp-feat-desc">{f.desc}</div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function HowItWorks() {
    const steps = [
        { n: '01', title: 'Open and record',       desc: 'Tap record. Neurativo starts capturing immediately — no setup, no configuration, no accounts to link.' },
        { n: '02', title: 'Watch it unfold',        desc: 'The transcript appears as the lecturer speaks. Summaries build section by section. A complete overview takes shape automatically.' },
        { n: '03', title: 'Review and export',      desc: 'When the lecture ends, ask questions, select text for explanations, and download your PDF report with a single click.' },
    ];
    return (
        <section id="how-it-works" className="lp-sec">
            <div className="lp-sec-eye">How it works</div>
            <h2 className="lp-sec-h2">Three steps, no learning curve</h2>
            <p className="lp-sec-sub">Neurativo is designed to disappear into the background so you can stay focused on the lecture.</p>
            <div className="lp-steps">
                {steps.map(s => (
                    <div key={s.n} className="lp-step">
                        <div className="lp-step-n">{s.n}</div>
                        <div className="lp-step-title">{s.title}</div>
                        <div className="lp-step-desc">{s.desc}</div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function Testimonials() {
    const quotes = [
        {
            text: "I used to miss half the lecture trying to keep up with notes. With Neurativo I just focus and review the summary after. It's honestly changed how I study.",
            name: 'Sara M.',
            school: 'UCL · Biomedical Science',
            initials: 'SM',
        },
        {
            text: "The AI Q&A is incredible. I asked a question about a concept from 45 minutes into the lecture and it found the exact passage and explained it clearly.",
            name: 'James K.',
            school: 'Imperial College · Computer Science',
            initials: 'JK',
        },
        {
            text: "My Arabic lectures finally have perfect transcripts. Neurativo handles the language switch mid-sentence without missing a word. Nothing else comes close.",
            name: 'Nora A.',
            school: 'University of Toronto · Medicine',
            initials: 'NA',
        },
    ];
    return (
        <section className="lp-sec">
            <div className="lp-sec-eye">What students say</div>
            <h2 className="lp-sec-h2">Used in lectures every day</h2>
            <p className="lp-sec-sub">Students across 40+ universities rely on Neurativo to keep up in fast-paced lectures.</p>
            <div className="lp-testi-grid">
                {quotes.map(q => (
                    <div key={q.name} className="lp-testi-card">
                        <div className="lp-testi-stars">
                            {[...Array(5)].map((_, i) => <span key={i} className="lp-testi-star">★</span>)}
                        </div>
                        <p className="lp-testi-quote">"{q.text}"</p>
                        <div className="lp-testi-author">
                            <div className="lp-testi-avatar">{q.initials}</div>
                            <div>
                                <div className="lp-testi-name">{q.name}</div>
                                <div className="lp-testi-school">{q.school}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function FAQ() {
    const [open, setOpen] = useState(null);
    const items = [
        {
            q: 'How does Neurativo transcribe in real time?',
            a: 'Neurativo continuously captures audio from your microphone and transcribes it in real time. The delay from speech to text appearing on screen is typically under 3 seconds. Everything is automatic — just press record.',
        },
        {
            q: 'Does it work with any language?',
            a: 'Yes. Neurativo supports over 50 languages and automatically detects the language being spoken. If your lecturer switches languages mid-session, Neurativo handles it without any configuration.',
        },
        {
            q: 'What happens if I lose my internet connection?',
            a: "Recording continues uninterrupted even when you go offline. Audio is buffered locally and uploaded automatically when your connection returns. You'll see a banner letting you know — nothing is ever lost.",
        },
        {
            q: 'How accurate are the summaries?',
            a: 'Summaries are generated directly from your transcript, so accuracy reflects how clearly the lecture was captured. In typical classroom environments with a clear speaker, summary quality is very high. Background noise may occasionally affect transcription in loud rooms.',
        },
        {
            q: 'Can I ask questions about a lecture I recorded last week?',
            a: 'Yes. Every lecture is saved and searchable. Open any past lecture from your dashboard, go to the Ask tab, and ask questions — the AI searches the full transcript semantically to find the most relevant answer.',
        },
        {
            q: "What's in the PDF export?",
            a: "The PDF includes a cover page with the lecture title and date, the full transcript, all section summaries, key concepts, and your Q&A history. It's formatted cleanly for printing or saving to Notion.",
        },
        {
            q: 'Is my data private?',
            a: 'Your lectures are stored in your personal account and are private by default. You can optionally share a lecture via a unique link — recipients can only view, not edit. You can revoke sharing at any time.',
        },
        {
            q: "What's the difference between Free, Student, and Pro?",
            a: 'Free gives 5 live lectures (30 min each) and 3 imports/month — 2.5 hrs total. Student ($19/mo · Rs. 5,795) gives unlimited live lectures up to 3 hours each, 20 imports, and 25 hrs/month total. Pro ($39/mo · Rs. 11,895) gives unlimited everything with a 60 hrs/month ceiling.',
        },
    ];
    return (
        <section id="faq" className="lp-sec">
            <div className="lp-sec-eye">FAQ</div>
            <h2 className="lp-sec-h2">Questions we get asked</h2>
            <p className="lp-sec-sub">Everything you need to know before hitting record.</p>
            <div className="lp-faq">
                {items.map((item, i) => (
                    <div key={i} className="lp-faq-item">
                        <button className="lp-faq-q" onClick={() => setOpen(open === i ? null : i)}>
                            <span>{item.q}</span>
                            <svg className={`lp-faq-chevron ${open === i ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9"/>
                            </svg>
                        </button>
                        {open === i && <div className="lp-faq-a">{item.a}</div>}
                    </div>
                ))}
            </div>
        </section>
    );
}

function PlanItem({ text }) {
    return (
        <li className="lp-plan-item">
            <span className="lp-check"><IconCheck /></span>
            {text}
        </li>
    );
}

function Pricing() {
    const { openSignUp } = useAuthModal();
    return (
        <section id="pricing" className="lp-sec">
            <div className="lp-sec-eye">Pricing</div>
            <h2 className="lp-sec-h2">Simple, honest pricing</h2>
            <p className="lp-sec-sub">Start free. Upgrade when you need more. No hidden fees, no surprise charges.</p>
            <div className="lp-pricing">

                {/* Free */}
                <div className="lp-plan">
                    <div className="lp-plan-name">Free</div>
                    <div className="lp-plan-tagline">Try it — no card needed</div>
                    <div className="lp-price-row">
                        <span className="lp-price-sign">$</span>
                        <span className="lp-price-big">0</span>
                    </div>
                    <div className="lp-price-mo">forever</div>
                    <div className="lp-price-lkr">Rs. 0</div>
                    <div className="lp-plan-div" />
                    <ul className="lp-plan-items">
                        <PlanItem text="5 live lectures / month" />
                        <PlanItem text="30 min max per lecture" />
                        <PlanItem text="3 audio imports / month" />
                        <PlanItem text="Up to 60 min per import" />
                        <PlanItem text="2.5 hrs total / month" />
                        <PlanItem text="PDF export · 40+ languages" />
                    </ul>
                    <button className="lp-btn-plan-outline" onClick={openSignUp}>Get started free</button>
                </div>

                {/* Student — featured */}
                <div className="lp-plan-feat">
                    <div className="lp-plan-badge">Most Popular</div>
                    <div className="lp-plan-name">Student</div>
                    <div className="lp-plan-tagline">For serious students</div>
                    <div className="lp-price-row">
                        <span className="lp-price-sign">$</span>
                        <span className="lp-price-big">19</span>
                    </div>
                    <div className="lp-price-mo">per month</div>
                    <div className="lp-price-lkr">Rs. 5,795 / month</div>
                    <div className="lp-plan-div" />
                    <ul className="lp-plan-items">
                        <PlanItem text="Unlimited live lectures" />
                        <PlanItem text="Up to 3 hours per lecture" />
                        <PlanItem text="20 audio imports / month" />
                        <PlanItem text="Up to 3 hours per import" />
                        <PlanItem text="25 hrs total / month" />
                        <PlanItem text="Everything in Free" />
                        <PlanItem text="Share lecture links" />
                    </ul>
                    <button className="lp-btn-plan-dark" onClick={openSignUp}>Start Student</button>
                </div>

                {/* Pro */}
                <div className="lp-plan">
                    <div className="lp-plan-name">Pro</div>
                    <div className="lp-plan-tagline">For researchers &amp; power users</div>
                    <div className="lp-price-row">
                        <span className="lp-price-sign">$</span>
                        <span className="lp-price-big">39</span>
                    </div>
                    <div className="lp-price-mo">per month</div>
                    <div className="lp-price-lkr">Rs. 11,895 / month</div>
                    <div className="lp-plan-div" />
                    <ul className="lp-plan-items">
                        <PlanItem text="Unlimited live lectures" />
                        <PlanItem text="No per-lecture duration cap" />
                        <PlanItem text="Unlimited audio imports" />
                        <PlanItem text="Up to 5 GB per file" />
                        <PlanItem text="60 hrs total / month" />
                        <PlanItem text="Everything in Student" />
                        <PlanItem text="Early feature access" />
                    </ul>
                    <button className="lp-btn-plan-outline" onClick={openSignUp}>Start Pro</button>
                </div>

            </div>
        </section>
    );
}

function CTASection() {
    const { openSignUp } = useAuthModal();
    return (
        <div className="lp-cta-wrap">
            <div className="lp-cta">
                <h2 className="lp-cta-h2">Your next lecture is waiting</h2>
                <p className="lp-cta-sub">
                    Join thousands of students who never miss a detail. Free to start, no credit card required.
                </p>
                <button className="lp-btn-light" onClick={openSignUp}>Start recording free</button>
            </div>
        </div>
    );
}

function About() {
    return (
        <section id="about" className="lp-sec">
            <p className="lp-sec-eye">About Neurativo</p>
            <div className="lp-about-quote">
                <h2 className="lp-about-quote-text">The AI teacher for the world.</h2>
                <p className="lp-about-quote-sub">Delivering live, lecture-quality education on any topic, anywhere.</p>
            </div>
            <div className="lp-about-cols">
                <div className="lp-about-col">
                    <p className="lp-about-col-label">The Problem</p>
                    <p className="lp-about-col-text">
                        Access to a great teacher is the single greatest predictor of learning outcomes — yet it remains one of the world's most unequally distributed resources. Billions of learners rely on static textbooks, passive videos, or overcrowded classrooms. There is no intelligent system that can teach a subject from first principles, adapt to the learner in real time, and do so at the depth and rigor of a world-class university lecture.
                    </p>
                </div>
                <div className="lp-about-col">
                    <p className="lp-about-col-label">Our Solution</p>
                    <p className="lp-about-col-text">
                        Neurativo is an AI educator platform that generates live, lecture-based summaries and high-quality academic content on any topic — combining the clarity of a great teacher with the depth of a research library. We are building toward a fully autonomous AI teacher: capable of structuring curricula, explaining concepts from first principles, and adapting to each learner in real time.
                    </p>
                </div>
            </div>
            <p className="lp-about-founders">
                Founded by <span>Shazad Arshad</span> &amp; <span>Shariff Ahamed</span> · Sri Lanka
            </p>
        </section>
    );
}

function Footer() {
    return (
        <footer className="lp-footer">
            <Link to="/" className="lp-footer-brand-wrap">
                <img src="/logo.png" alt="Neurativo" style={{ width: 26, height: 26, borderRadius: 6 }} />
                <span className="lp-footer-name">Neurativo</span>
            </Link>
            <div className="lp-footer-lnks">
                <Link to="/features" className="lp-footer-lnk">Features</Link>
                <Link to="/pricing" className="lp-footer-lnk">Pricing</Link>
                <Link to="/about" className="lp-footer-lnk">About</Link>
                <Link to="/privacy" className="lp-footer-lnk">Privacy</Link>
                <Link to="/terms" className="lp-footer-lnk">Terms</Link>
            </div>
            <div className="lp-footer-copy">© {new Date().getFullYear()} Neurativo. All rights reserved.</div>
        </footer>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LandingPage({ user }) {
    const location = useLocation();

    useSEO({
        title: null, // use default full title from index.html
        description: 'Neurativo records your lecture, transcribes every word, and builds structured AI summaries in real time — so you can focus on learning, not writing. Free to start.',
        canonicalPath: '/',
    });

    // Scroll to section when navigated from a section route (e.g. /pricing → /)
    useEffect(() => {
        const sectionId = location.state?.scrollTo;
        if (!sectionId) return;
        const el = document.getElementById(sectionId);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        // Clear the state so back-nav doesn't re-scroll
        window.history.replaceState({}, '');
    }, [location.state?.scrollTo]);

    return (
        <>
            <style>{CSS}</style>
            <div className="lp">
                <Navbar user={user} />
                <main>
                    <Hero user={user} />
                    <Mockup />
                    <UniversityBar />
                    <StatsBar />
                    <Features />
                    <NASTSection />
                    <HowItWorks />
                    <Testimonials />
                    <Pricing />
                    <About />
                    <FAQ />
                    <CTASection />
                </main>
                <Footer />
            </div>
        </>
    );
}
