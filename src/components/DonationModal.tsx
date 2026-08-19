"use client";

// ---------------------------------------------------------------------------
// Bahaba – Angat Buhay Official Disaster Relief & Donation Modal
// Displays official relief drive channels, GCash QR, BPI/BDO accounts with
// one-click copy, DSWD permit details, and receipt submission guidelines.
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

  if (!isOpen) return null;

  const copyToClipboard = (text: string, fieldName: string, actionType?: "copy_bpi" | "copy_bdo" | "copy_email") => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    if (actionType) {
      trackDonationAction({ action: actionType });
    }
    setTimeout(() => {
      setCopiedField(null);
    }, 2500);
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md transition-all duration-300 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-slate-900/95 border border-rose-500/40 rounded-3xl shadow-2xl shadow-rose-950/40 text-slate-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Gradient Glow Accent */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-rose-500 via-pink-500 to-amber-400" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-4 border-b border-slate-800/80 bg-slate-950/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 to-pink-500 flex items-center justify-center text-white text-lg shadow-lg shadow-rose-900/40">
              ❤️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Angat Buhay Relief Drive
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Official Channels
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Support flood relief & disaster response operations across the Philippines
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors border border-slate-700/60"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 px-5 sm:px-6 py-2.5 bg-slate-950/30 border-b border-slate-800/60 flex-shrink-0">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeTab === "overview"
              ? "bg-rose-600/90 text-white shadow-lg shadow-rose-950/50"
              : "bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
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
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${activeTab === "poster"
              ? "bg-rose-600/90 text-white shadow-lg shadow-rose-950/50"
              : "bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
          >
            <span>🖼️</span>
            <span>Official Notice & QR Poster</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
          {activeTab === "overview" ? (
            <div className="space-y-4">
              {/* Notice Banner */}
              <div className="p-3.5 rounded-2xl bg-rose-950/30 border border-rose-500/30 flex items-start gap-3">
                <div className="text-xl flex-shrink-0">📢</div>
                <div className="text-xs text-rose-200/90 leading-relaxed">
                  <strong className="text-rose-100 font-semibold">Official Notice:</strong> Please ensure you only transfer donations to Angat Buhay&apos;s verified financial accounts below.
                </div>
              </div>

              {/* Grid of Payment Methods */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* GCash Card */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 hover:border-blue-500/50 transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">📱</span>
                      <div>
                        <div className="font-bold text-white text-sm">GCash</div>
                        <div className="text-[11px] text-slate-400">Scan QR Code</div>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 font-mono font-medium">
                      QR Direct
                    </span>
                  </div>

                  <div className="relative w-full aspect-square max-w-[200px] mx-auto rounded-xl overflow-hidden border border-slate-800 bg-white p-2">
                    <Image
                      src="/angat_buhay.jpg"
                      alt="GCash QR Code - Angat Buhay"
                      fill
                      className="object-cover object-left-bottom"
                      sizes="200px"
                    />
                  </div>

                  <button
                    onClick={() => {
                      setActiveTab("poster");
                      trackDonationAction({ action: "view_image" });
                    }}
                    className="mt-3 w-full py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold transition-all text-center flex items-center justify-center gap-1.5"
                  >
                    <span>🔍</span>
                    <span>View Full Poster & QR</span>
                  </button>
                </div>

                {/* Bank Accounts Column */}
                <div className="space-y-3 flex flex-col justify-between">
                  {/* BPI Card */}
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 hover:border-red-500/50 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🏦</span>
                        <div>
                          <div className="font-bold text-white text-sm">Bank of the Philippine Islands (BPI)</div>
                          <div className="text-[11px] text-slate-400">Maxi-One Current Account</div>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-red-500/20 text-red-300 font-mono font-medium">
                        BPI
                      </span>
                    </div>

                    <div className="mt-2 space-y-1">
                      <div className="text-[11px] text-slate-400">Account Name:</div>
                      <div className="font-semibold text-slate-200 text-xs tracking-wide">ANGAT PINAS, INC.</div>
                    </div>

                    <div className="mt-2 flex items-center justify-between bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-800">
                      <div>
                        <div className="text-[10px] text-slate-400">Account Number:</div>
                        <div className="font-mono font-bold text-rose-300 text-sm tracking-wider">
                          0011-1921-65
                        </div>
                      </div>
                      <button
                        onClick={() => copyToClipboard("0011-1921-65", "bpi", "copy_bpi")}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/40 text-rose-300 text-xs font-semibold transition-all flex items-center gap-1 active:scale-95"
                      >
                        {copiedField === "bpi" ? (
                          <>
                            <span className="text-emerald-400 font-bold">✓</span>
                            <span className="text-emerald-300">Copied!</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* BDO Card */}
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 hover:border-blue-500/50 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🏦</span>
                        <div>
                          <div className="font-bold text-white text-sm">Banco de Oro (BDO)</div>
                          <div className="text-[11px] text-slate-400">Account</div>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 font-mono font-medium">
                        BDO
                      </span>
                    </div>

                    <div className="mt-2 space-y-1">
                      <div className="text-[11px] text-slate-400">Account Name:</div>
                      <div className="font-semibold text-slate-200 text-xs tracking-wide">ANGAT PINAS, INC.</div>
                    </div>

                    <div className="mt-2 flex items-center justify-between bg-slate-900/90 px-3 py-2 rounded-xl border border-slate-800">
                      <div>
                        <div className="text-[10px] text-slate-400">Account Number:</div>
                        <div className="font-mono font-bold text-blue-300 text-sm tracking-wider">
                          002778-0169-86
                        </div>
                      </div>
                      <button
                        onClick={() => copyToClipboard("002778-0169-86", "bdo", "copy_bdo")}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/40 text-blue-300 text-xs font-semibold transition-all flex items-center gap-1 active:scale-95"
                      >
                        {copiedField === "bdo" ? (
                          <>
                            <span className="text-emerald-400 font-bold">✓</span>
                            <span className="text-emerald-300">Copied!</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Official Receipt & Verification Note */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <span>🧾</span>
                  <span>Official Receipt & Verification Guidelines:</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  To ensure proper acknowledgment and efficient tracking, kindly send a photo of your transaction or deposit slip, along with your full name and address, to:
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <a
                    href="mailto:donate@angatbuhay.ph"
                    className="font-mono text-cyan-400 hover:text-cyan-300 text-xs font-semibold underline underline-offset-2 flex items-center gap-1"
                  >
                    <span>✉️ donate@angatbuhay.ph</span>
                  </a>
                  <button
                    onClick={() => copyToClipboard("donate@angatbuhay.ph", "email", "copy_email")}
                    className="px-2.5 py-1 rounded-lg bg-cyan-950/50 hover:bg-cyan-900/50 border border-cyan-500/40 text-cyan-300 text-xs transition-all active:scale-95"
                  >
                    {copiedField === "email" ? "Copied Email!" : "Copy Email"}
                  </button>
                </div>
              </div>


            </div>
          ) : (
            /* Poster View Tab */
            <div className="space-y-4 flex flex-col items-center">
              <div className="relative w-full max-w-lg aspect-square rounded-2xl overflow-hidden border border-slate-700 shadow-2xl bg-white">
                <Image
                  src="/angat_buhay.jpg"
                  alt="Angat Buhay Official Donation Accounts"
                  fill
                  className="object-contain"
                  priority
                  sizes="(max-width: 768px) 100vw, 512px"
                />
              </div>

              <div className="flex items-center gap-3">
                <a
                  href="/angat_buhay.jpg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-600 transition-all flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span>Open Full Size</span>
                </a>
                <a
                  href="/angat_buhay.jpg"
                  download="angat_buhay_donation_accounts.jpg"
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-950/50 transition-all flex items-center gap-1.5"
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
        <div className="px-5 sm:px-6 py-3 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400 flex-shrink-0">
          <span>bahaba.nicolei.games</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
