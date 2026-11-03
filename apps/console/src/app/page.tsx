import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import "./console-home.css";

export const metadata: Metadata = {
  title: "KIYT Console — Cognitive Intelligence",
  description:
    "Your gateway to cognitive intelligence. Sign in to KIYT Console to build with reasoning, persistent memory, and continuous learning.",
  icons: {
    icon: [
      { url: "/kiyt-console/assets/favicon.ico", sizes: "any" },
      { url: "/kiyt-console/assets/kiyt-favicon.png", type: "image/png" },
    ],
  },
};

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#05080f",
};

export default async function Home() {
  const session =
    await auth.api.getSession({
      headers:
        await headers(),
    });

  if (session) {
    redirect("/myaccount");
  }

  return (
    <>
      <a className="skip-link" href="#login">Skip to sign in</a>
      <div className="page-shell">
        <header className="site-header">
          <a className="brand" href="https://kiyt.io/" aria-label="KIYT home">
            <img src="/kiyt-console/assets/kiyt-logo.png" alt="KIYT" width="112" height="38" />
            <span className="brand-divider" aria-hidden="true"></span><span className="brand-console">Console</span>
          </a>
          <nav className="main-nav" aria-label="Main navigation">
            <a href="mailto:connect@kiyt.io?subject=KIYT%20Documentation" id="documentation-link">Documentation <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg></a>
            <a href="mailto:connect@kiyt.io?subject=KIYT%20Console%20%E2%80%94%20Sales%20enquiry" className="sales-link" data-sales-link>Contact Sales <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg></a>
          </nav>
        </header>

        <main className="console-main">
          <section className="cognitive-story" aria-labelledby="story-title">
            <div className="story-topline"><span className="eyebrow">THE COGNITIVE INTELLIGENCE PLATFORM</span><span className="coordinate" aria-hidden="true">01 / ∞</span></div>
            <div className="story-copy">
              <h1 id="story-title">A deeper kind<br />of <span>intelligence.</span></h1>
              <p>Beyond responses. Into reasoning,<br className="desktop-break" /> memory, and continuous evolution.</p>
            </div>
            <div className="neural-stage" aria-hidden="true">
              <div className="stage-grid"></div>
              <div className="stage-halo"></div>
              <span className="stage-corner corner-tl"></span><span className="stage-corner corner-tr"></span>
              <span className="stage-corner corner-bl"></span><span className="stage-corner corner-br"></span>
              <div className="orbit orbit-one"></div><div className="orbit orbit-two"></div>
              <img className="brain-fallback" src="/kiyt-console/assets/cognitive-brain.png" alt="" width="1024" height="1024" fetchPriority="high" />
              <canvas id="neural-canvas"></canvas>
              <div className="neural-label label-reason"><span></span>REASONING</div>
              <div className="neural-label label-memory"><span></span>PERSISTENT MEMORY</div>
              <span className="stage-index">HUMAN-INSPIRED COGNITION</span>
              <span className="stage-axis">X <i></i> Y</span>
            </div>
            <div className="cognition-note">
              <span className="note-symbol" aria-hidden="true"><i></i><i></i><i></i></span>
              <p>Understands context. Retains experience.<br /><strong>Gets better with every outcome.</strong></p>
            </div>
          </section>

          <section className="access-section" id="login" aria-labelledby="login-title">
            <div className="access-wrap">
              <div className="access-caption"><span className="caption-line" aria-hidden="true"></span> YOUR GATEWAY TO WHAT’S NEXT</div>
              <div className="access-panel">
                <div className="panel-accent" aria-hidden="true"></div>
                <div className="access-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M18 7h7v18h-7M6 16h14m-5-5 5 5-5 5" /></svg></div>
                <button
                  className="auth-button google-button"
                  id="google-signin"
                  type="button"
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  <span>Continue with Google</span>
                </button>

                <div className="form-divider" aria-hidden="true">
                  <span></span>
                  <span>or continue with email</span>
                  <span></span>
                </div>

                <div className="auth-viewport" id="auth-viewport">
                  <div className="auth-track" id="auth-track">

                    <div
                      className="auth-step auth-step-email"
                      id="auth-email-step"
                    >
                      <div className="access-heading">
                        <span className="eyebrow">KIYT CONSOLE</span>
                        <h2 id="login-title">Intelligence awaits.</h2>
                        <p>Sign in to your cognitive workspace.</p>
                      </div>

                      <form id="email-form" noValidate>
                        <label htmlFor="email">Email address</label>

                        <div className="input-wrap">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect
                              x="3"
                              y="5"
                              width="18"
                              height="14"
                              rx="3"
                            />
                            <path d="m4 7 8 6 8-6" />
                          </svg>

                          <input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            inputMode="email"
                            maxLength={254}
                            placeholder="you@company.com"
                            required
                            aria-describedby="email-error"
                            spellCheck={false}
                          />
                        </div>

                        <p
                          id="email-error"
                          className="field-error"
                          role="alert"
                          hidden
                        ></p>

                        <button
                          className="auth-button email-button"
                          id="email-submit"
                          type="submit"
                        >
                          <span>Continue with email</span>

                          <svg
                            className="button-arrow"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path d="M5 12h14m-5-5 5 5-5 5" />
                          </svg>
                        </button>
                      </form>

                      <p className="sign-in-note">
                        One account. Your cognitive intelligence, connected.
                      </p>
                    </div>

                    <div
                      className="auth-step auth-step-register"
                      id="auth-register-step"
                      aria-hidden="true"
                    >
                      <div className="access-heading register-heading">
                        <span className="eyebrow">KIYT CONSOLE</span>

                        <h2>Welcome to Cognitive Playground</h2>

                        <p>Fill This Form</p>
                      </div>

                      <form id="register-form" noValidate>
                        <input
                          id="register-email"
                          name="email"
                          type="hidden"
                        />

                        <div className="register-field">
                          <label htmlFor="first-name">
                            First Name
                          </label>

                          <div className="input-wrap input-wrap-plain">
                            <input
                              id="first-name"
                              name="firstName"
                              type="text"
                              autoComplete="given-name"
                              maxLength={80}
                              required
                            />
                          </div>
                        </div>

                        <div className="register-field">
                          <label htmlFor="last-name">
                            Last Name
                          </label>

                          <div className="input-wrap input-wrap-plain">
                            <input
                              id="last-name"
                              name="lastName"
                              type="text"
                              autoComplete="family-name"
                              maxLength={80}
                              required
                            />
                          </div>
                        </div>

                        <div className="register-field">
                          <label htmlFor="register-password">
                            Password
                          </label>

                          <div className="input-wrap input-wrap-plain">
                            <input
                              id="register-password"
                              name="password"
                              type="password"
                              autoComplete="new-password"
                              required
                            />
                          </div>
                        </div>

                        <div className="register-field">
                          <label htmlFor="repeat-password">
                            Repeat Password
                          </label>

                          <div className="input-wrap input-wrap-plain">
                            <input
                              id="repeat-password"
                              name="repeatPassword"
                              type="password"
                              autoComplete="new-password"
                              required
                              aria-describedby="register-error"
                            />
                          </div>
                        </div>

                        <p
                          id="register-error"
                          className="field-error"
                          role="alert"
                          hidden
                        ></p>

                        <button
                          className="auth-button email-button"
                          id="register-submit"
                          type="submit"
                        >
                          <span>Register</span>

                          <svg
                            className="button-arrow"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path d="M5 12h14m-5-5 5 5-5 5" />
                          </svg>
                        </button>

                        <p
                          className="auth-feedback"
                          id="register-feedback"
                          role="status"
                          hidden
                        ></p>
                      </form>
                    </div>

                  </div>
                </div>
                <noscript><p className="field-error">Please enable JavaScript to continue with sign in.</p></noscript>
              </div>
              <div className="access-help"><span>Building something bigger?</span><a href="mailto:connect@kiyt.io?subject=KIYT%20Console%20%E2%80%94%20Sales%20enquiry" data-sales-link>Let’s talk <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg></a></div>
            </div>
          </section>
        </main>

        <footer className="site-footer"><span>© <span id="copyright-year">2026</span> KIYT. All rights reserved.</span><span className="footer-vision"><i aria-hidden="true"></i> HUMAN-INSPIRED. BUILT TO EVOLVE.</span></footer>
      </div>

      <dialog id="info-dialog" aria-labelledby="dialog-title" aria-describedby="dialog-description">
        <form method="dialog"><button className="dialog-close" aria-label="Close dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></form>
        <span className="eyebrow" id="dialog-eyebrow">KIYT CONSOLE</span>
        <h2 id="dialog-title"></h2><p id="dialog-description"></p>
        <a className="dialog-contact" href="mailto:connect@kiyt.io">Contact the KIYT team <span aria-hidden="true">↗</span></a>
        <form method="dialog"><button className="auth-button email-button dialog-done">Got it <span aria-hidden="true">→</span></button></form>
      </dialog>

      <Script src="/kiyt-console/template-auth-live-v2.js" strategy="afterInteractive" />
    </>
  );
}
