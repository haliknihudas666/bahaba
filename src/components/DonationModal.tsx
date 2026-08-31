"use client";

// ---------------------------------------------------------------------------
// Bahaba – Angat Buhay Official Disaster Relief & Donation Modal
// Displays official relief drive channels, GCash QR, BPI/BDO accounts with
// one-click copy, DSWD permit details, and receipt submission guidelines.
// Mobile-first responsive UX with bottom-sheet drawer on mobile.
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import Image from "next/image";
import { trackDonationAction } from "@/lib/firebase/analytics";

interface DonationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DonationModal({ isOpen, onClose }: DonationModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "poster">("overview");

  // Track modal open
  useEffect(() => {
    if (isOpen) {
      trackDonationAction({ action: "open_modal" });
    }
  }, [isOpen]);

  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll on open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, fieldName: string, actionType?: "copy_bpi" | "copy_bdo" | "copy_email") => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    if (actionType) {
      trackDonationAction({ action: actionType });
    }
    setTimeout(() => {
      setCopiedField(null);
    }, 2200);
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md transition-all duration-300 animate-in fade-in"
      onClick={onClose}
    >
      {/* Floating Modal Container */}
      <div
        className="relative w-full max-w-lg sm:max-w-xl max-h-[85vh] sm:max-h-[88vh] flex flex-col bg-slate-900/98 sm:bg-slate-900/95 border border-rose-500/30 rounded-3xl shadow-2xl shadow-rose-950/50 text-slate-100 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Gradient Glow Accent */}
        <div className="absolute top-0 inset-x-0 h-1 sm:h-1.5 bg-gradient-to-r from-rose-500 via-pink-500 to-amber-400 z-10" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-slate-800/80 bg-slate-950/40 flex-shrink-0 gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3.5 flex-1 min-w-0">

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  ❤️ Angat Buhay Relief Drive ❤️
                </h2>
                <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 whitespace-nowrap flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Official Channels
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 leading-tight">
                Support disaster response across the Philippines
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-slate-400 hover:text-white flex items-center justify-center transition-all border border-slate-700/60 flex-shrink-0 ml-1"
            title="Close"
            aria-label="Close modal"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 bg-slate-950/60 border-b border-slate-800/60 flex-shrink-0">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 sm:py-1.5 rounded-xl text-xs font-semibold transition-all ${activeTab === "overview"
              ? "bg-rose-600 text-white shadow-md shadow-rose-950/50"
              : "bg-slate-800/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800 active:bg-slate-800"
              }`}
          >
            <span>💳</span>
            <span>Accounts & Details</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("poster");
              trackDonationAction({ action: "view_image" });
            }}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 sm:py-1.5 rounded-xl text-xs font-semibold transition-all ${activeTab === "poster"
              ? "bg-rose-600 text-white shadow-md shadow-rose-950/50"
              : "bg-slate-800/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800 active:bg-slate-800"
              }`}
          >
            <span>🖼️</span>
            <span>Full Poster & QR</span>
          </button>
        </div>

        {/* Modal Body with Custom Scroll */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-3.5 sm:p-5 space-y-3.5 custom-scrollbar">
          {activeTab === "overview" ? (
            <div className="space-y-3">
              {/* Notice / DSWD Trust Card */}
              <div className="p-3 rounded-2xl bg-rose-950/20 border border-rose-500/25 flex items-start gap-2.5">
                <div className="text-base sm:text-lg flex-shrink-0 mt-0.5">🛡️</div>
                <div className="text-[11px] sm:text-xs text-rose-200/90 leading-relaxed min-w-0">
                  <strong className="text-rose-100 font-semibold">Verified Official Accounts:</strong> Angat Buhay operates under DSWD Permit No. <span className="font-mono text-rose-300 font-medium whitespace-nowrap">DSWD-SB-PSP-S-2025-000049</span>.
                </div>
              </div>

              {/* GCash Quick Action Card */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950/70 border border-sky-500/30 hover:border-sky-500/50 transition-all">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center text-base flex-shrink-0">
                      📱
                    </div>
                    <div>
                      <div className="font-bold text-white text-xs sm:text-sm">GCash Donation</div>
                      <div className="text-[10px] sm:text-[11px] text-slate-400">Scan QR Code via GCash App</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 font-mono font-medium border border-sky-500/20">
                    GCash QR
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-900/90 p-2.5 sm:p-3 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("poster");
                      trackDonationAction({ action: "view_image" });
                    }}
                    className="relative w-28 h-28 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-white p-1 flex-shrink-0 group cursor-pointer border border-slate-700 hover:border-sky-400 transition-all"
                  >
                    <Image
                      src="/angat_buhay.jpg"
                      alt="GCash QR Code"
                      fill
                      className="object-contain"
                      sizes="112px"
                    />
                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-semibold text-center p-1">
                      Tap to Enlarge
                    </div>
                  </button>

                  <div className="flex-1 text-center sm:text-left space-y-2 w-full">
                    <div className="text-[11px] text-slate-300 leading-snug">
                      Open your GCash app and select <strong className="text-sky-300">Scan QR</strong> to transfer directly to Angat Buhay.
                    </div>
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("poster");
                          trackDonationAction({ action: "view_image" });
                        }}
                        className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 active:scale-95 border border-sky-500/40 text-sky-300 text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                        </svg>
                        <span>View / Enlarge QR</span>
                      </button>
                      <a
                        href="/angat_buhay.jpg"
                        download="angat_buhay_gcash_qr.jpg"
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 text-xs font-semibold transition-all flex items-center justify-center gap-1 border border-slate-700"
                        title="Save QR Code"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>Save</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bank Transfer Cards (BPI & BDO) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* BPI Card */}
                <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950/70 border border-red-500/30 hover:border-red-500/50 transition-all flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-red-500/20 flex items-center justify-center text-sm flex-shrink-0">
                        🏦
                      </div>
                      <div className="font-bold text-white text-xs sm:text-sm">BPI Bank Transfer</div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-mono font-medium">
                      Maxi-One
                    </span>
                  </div>

                  {/* Account Name (Copyable) */}
                  <button
                    type="button"
                    onClick={() => copyToClipboard("ANGAT PINAS, INC.", "name_bpi")}
                    className="w-full flex items-center justify-between bg-slate-900/90 hover:bg-slate-800/90 active:scale-[0.98] px-3 py-2 rounded-xl border border-slate-700/80 transition-all group text-left cursor-pointer"
                    title="Click to copy Account Name"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="text-[9px] text-slate-400 uppercase tracking-wider">Account Name</div>
                      <div className="font-bold text-slate-100 text-xs sm:text-sm tracking-wide truncate">
                        ANGAT PINAS, INC.
                      </div>
                    </div>
                    <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 flex-shrink-0 ${copiedField === "name_bpi"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-rose-600/20 group-hover:bg-rose-600/40 text-rose-300 border border-rose-500/40"
                      }`}>
                      {copiedField === "name_bpi" ? (
                        <>
                          <span className="text-emerald-400 font-bold">✓</span>
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span>Copy</span>
                        </>
                      )}
                    </div>
                  </button>

                  {/* Account Number (Copyable) */}
                  <button
                    type="button"
                    onClick={() => copyToClipboard("0011-1921-65", "bpi", "copy_bpi")}
                    className="w-full flex items-center justify-between bg-slate-900/90 hover:bg-slate-800/90 active:scale-[0.98] px-3 py-2 rounded-xl border border-slate-700/80 transition-all group text-left cursor-pointer"
                    title="Click to copy Account Number"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="text-[9px] text-slate-400 uppercase tracking-wider">Account Number</div>
                      <div className="font-mono font-bold text-rose-300 text-sm tracking-wider">
                        0011-1921-65
                      </div>
                    </div>
                    <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 flex-shrink-0 ${copiedField === "bpi"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-rose-600/20 group-hover:bg-rose-600/40 text-rose-300 border border-rose-500/40"
                      }`}>
                      {copiedField === "bpi" ? (
                        <>
                          <span className="text-emerald-400 font-bold">✓</span>
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span>Copy</span>
                        </>
                      )}
                    </div>
                  </button>
                </div>

                {/* BDO Card */}
                <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950/70 border border-blue-500/30 hover:border-blue-500/50 transition-all flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-blue-500/20 flex items-center justify-center text-sm flex-shrink-0">
                        🏦
                      </div>
                      <div className="font-bold text-white text-xs sm:text-sm">BDO Bank Transfer</div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono font-medium">
                      BDO Account
                    </span>
                  </div>

                  {/* Account Name (Copyable) */}
                  <button
                    type="button"
                    onClick={() => copyToClipboard("ANGAT PINAS, INC.", "name_bdo")}
                    className="w-full flex items-center justify-between bg-slate-900/90 hover:bg-slate-800/90 active:scale-[0.98] px-3 py-2 rounded-xl border border-slate-700/80 transition-all group text-left cursor-pointer"
                    title="Click to copy Account Name"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="text-[9px] text-slate-400 uppercase tracking-wider">Account Name</div>
                      <div className="font-bold text-slate-100 text-xs sm:text-sm tracking-wide truncate">
                        ANGAT PINAS, INC.
                      </div>
                    </div>
                    <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 flex-shrink-0 ${copiedField === "name_bdo"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-blue-600/20 group-hover:bg-blue-600/40 text-blue-300 border border-blue-500/40"
                      }`}>
                      {copiedField === "name_bdo" ? (
                        <>
                          <span className="text-emerald-400 font-bold">✓</span>
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span>Copy</span>
                        </>
                      )}
                    </div>
                  </button>

                  {/* Account Number (Copyable) */}
                  <button
                    type="button"
                    onClick={() => copyToClipboard("002778-0169-86", "bdo", "copy_bdo")}
                    className="w-full flex items-center justify-between bg-slate-900/90 hover:bg-slate-800/90 active:scale-[0.98] px-3 py-2 rounded-xl border border-slate-700/80 transition-all group text-left cursor-pointer"
                    title="Click to copy Account Number"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="text-[9px] text-slate-400 uppercase tracking-wider">Account Number</div>
                      <div className="font-mono font-bold text-blue-300 text-sm tracking-wider">
                        002778-0169-86
                      </div>
                    </div>
                    <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 flex-shrink-0 ${copiedField === "bdo"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-blue-600/20 group-hover:bg-blue-600/40 text-blue-300 border border-blue-500/40"
                      }`}>
                      {copiedField === "bdo" ? (
                        <>
                          <span className="text-emerald-400 font-bold">✓</span>
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span>Copy</span>
                        </>
                      )}
                    </div>
                  </button>
                </div>
              </div>

              {/* Official Receipt & Verification Note */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <span>🧾</span>
                  <span>Official Receipt & Acknowledgment:</span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
                  Send a photo of your transaction slip with your full name & address to receive an official receipt:
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <a
                    href="mailto:donate@angatbuhay.ph"
                    className="font-mono text-cyan-400 hover:text-cyan-300 text-xs font-semibold underline underline-offset-2 flex items-center gap-1.5"
                  >
                    <span>✉️</span>
                    <span>donate@angatbuhay.ph</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => copyToClipboard("donate@angatbuhay.ph", "email", "copy_email")}
                    className="px-2.5 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 text-xs transition-all active:scale-95 flex items-center gap-1"
                  >
                    {copiedField === "email" ? (
                      <span className="text-emerald-300 font-semibold">✓ Copied Email!</span>
                    ) : (
                      <span>Copy Email</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Poster View Tab */
            <div className="space-y-3.5 flex flex-col items-center">
              <div className="relative w-full max-w-md aspect-square rounded-2xl overflow-hidden border border-slate-700 shadow-2xl bg-white">
                <Image
                  src="/angat_buhay.jpg"
                  alt="Angat Buhay Official Donation Accounts and DSWD Authorization"
                  fill
                  className="object-contain"
                  priority
                  sizes="(max-width: 768px) 100vw, 448px"
                />
              </div>

              <div className="w-full max-w-md flex items-center gap-2 sm:gap-3">
                <a
                  href="/angat_buhay.jpg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 sm:py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span>Open Full Size</span>
                </a>
                <a
                  href="/angat_buhay.jpg"
                  download="angat_buhay_donation_accounts.jpg"
                  className="flex-1 py-2 sm:py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-semibold shadow-lg shadow-rose-950/50 transition-all flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Download Poster</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-t border-slate-800/80 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400 flex-shrink-0">
          <span className="text-[11px] text-slate-500 font-mono">bahaba.nicolei.games</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 font-semibold transition-all text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

