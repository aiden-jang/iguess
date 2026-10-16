import { AppUpdate } from "./AppUpdate";
import { ClubFace } from "./ClubFace";
import { ResourceLinks } from "./ResourceDialog";
import { JoinForm } from "./JoinForm";
import { DoodlePoster } from "./DoodlePoster";
import type { JoinProps } from "./join.types";
import "./join.css";

export function JoinScreen(props: JoinProps) {
  return (
    <div className="join-page" data-invited={props.invited}>
      <AppUpdate />
      <header className="join-header">
        <a href="/" className="wordmark" aria-label="iguess home">
          iguess<span aria-hidden>✳</span>
        </a>
        <span className="join-header-note">A drawing game. Technically.</span>
        <a className="join-jump" href="#join-form">
          Let’s play <span aria-hidden>↗</span>
        </a>
      </header>
      <main className="join-layout">
        <section className="join-intro" aria-labelledby="join-title">
          <p className="eyebrow">
            <span className="club-dot" /> Very casual. Mildly competitive.
          </p>
          <h1 id="join-title">
            Draw badly.
            <br />
            <em>Guess wildly.</em>
          </h1>
          <p className="join-description">
            A drawing game for your friends. And one
            <br className="desktop-break" /> deeply confident machine.
          </p>
        </section>
        <JoinForm {...props} />
        <div className="join-example">
          <DoodlePoster />
          <div className="join-afterthought">
            <span>No talent required.</span>
            <span>We checked. Loosely.</span>
          </div>
        </div>
      </main>
      <section className="join-how" aria-label="The extremely short version">
        <div className="how-intro">
          <ClubFace />
          <span>
            The extremely
            <br />
            short version.
          </span>
        </div>
        <p>
          <b>01</b>
          <span>
            Draw the word.<small>Resemblance is appreciated.</small>
          </span>
        </p>
        <p>
          <b>02</b>
          <span>
            Guess before everyone else.
            <small>Including the smug machine.</small>
          </span>
        </p>
        <p>
          <b>03</b>
          <span>
            Keep the evidence.<small>For legal reasons: art.</small>
          </span>
        </p>
      </section>
      <footer className="join-footer">
        <span>Low stakes. Strong opinions.</span>
        <ResourceLinks />
        <a
          href="https://aidenjang.com"
          target="_blank"
          aria-describedby="external-link-hint"
          rel="noopener noreferrer"
        >
          By Aiden ↗
        </a>
        <a href="mailto:me@aidenjang.com">Help / feedback ↗</a>
      </footer>
    </div>
  );
}
