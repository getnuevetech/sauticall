export function HomeStage() {
  const people = [
    ["SC", "Sarah Chen", "Ext. 101", "Available"],
    ["ML", "Marcus Lee", "Ext. 102", "On a call"],
    ["PS", "Priya Shah", "Ext. 103", "Available"],
    ["DK", "David Kim", "Ext. 104", "Away"],
  ];
  return (
    <div className="stage" aria-hidden="true">
      <div className="laptop">
        <div className="laptop-top"><i /><i /><i /><b>SautiCall</b></div>
        <div className="laptop-app">
          <aside>
            <span className="on">Team</span>
            <span>Calls</span>
            <span>Numbers</span>
            <span>Settings</span>
          </aside>
          <div>
            <header>Team extensions</header>
            {people.map(([mark, name, ext, state]) => (
              <div key={ext} className="person">
                <i>{mark}</i>
                <span><b>{name}</b><small>{ext}</small></span>
                <em className={state === "Available" ? "ok" : state === "On a call" ? "busy" : ""}>{state}</em>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="callchip">
        <i />
        <span><b>(302) 555-0101</b><small>Route to your team</small></span>
      </div>
      <div className="handset">
        <div className="hand" />
        <div className="base"><b>SautiCall</b><small>Ext. 101</small></div>
      </div>
      <div className="mobile">
        <b>SautiCall</b>
        <strong>Incoming</strong>
        <small>Answer · Route</small>
      </div>
    </div>
  );
}

export function SystemSketch() {
  return (
    <div className="sketch" aria-hidden="true">
      {[["SC", "Sarah Chen", "Ext. 101"], ["ML", "Marcus Lee", "Ext. 102"], ["PS", "Priya Shah", "Ext. 103"]].map(([mark, name, ext]) => (
        <div key={ext}><i>{mark}</i><span><b>{name}</b><small>{ext}</small></span></div>
      ))}
    </div>
  );
}

export function WaveSketch() {
  return (
    <div className="wave" aria-hidden="true">
      <div className="orb">AI</div>
      <div className="bars">{[8, 16, 24, 14, 20, 10, 18].map((height, index) => <i key={index} style={{ height }} />)}</div>
      <small>Answer · Route</small>
    </div>
  );
}

export function NumberSketch() {
  return (
    <div className="numsketch" aria-hidden="true">
      <b>(302) 555-0101</b>
      <div><span>Local</span><em>Available</em></div>
      <div><span>Toll-free</span><em>Available</em></div>
    </div>
  );
}

export function DeviceSketch() {
  return (
    <div className="devices" aria-hidden="true">
      <div className="mini-desk"><i /><b /></div>
      <div className="mini-phone"><b>SautiCall</b><small>Answer</small></div>
    </div>
  );
}

export function DeskMock() {
  const rows = [
    ["AS", "Accounting", "1001", "Available"],
    ["SD", "Sales", "1002", "On a call"],
    ["CS", "Customer Support", "1003", "Available"],
    ["MK", "Marketing", "1004", "Away"],
    ["IT", "IT Support", "1005", "Available"],
  ];
  return (
    <div className="desk" aria-hidden="true">
      <div className="monitor">
        <header><b>SautiCall</b><span>Extensions</span></header>
        <div className="desk-app">
          <aside><span className="on">Calls</span><span>Team</span><span>Numbers</span><span>Settings</span></aside>
          <div>
            {rows.map(([mark, name, ext, state]) => (
              <div key={ext} className="person">
                <i>{mark}</i><span><b>{name}</b><small>{ext}</small></span><em className={state === "Available" ? "ok" : ""}>{state}</em>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="dialer">
        <b>SautiCall</b>
        <div className="eq"><i /><i /><i /><i /><i /></div>
        <small>00:24</small>
      </div>
    </div>
  );
}

export function CallsMock() {
  const calls = [
    ["AM", "Alex Mwangi", "Incoming", "10:24"],
    ["RN", "Ruth Njeri", "Outgoing", "09:18"],
    ["JO", "Jacob Otieno", "Missed", "Yesterday"],
    ["GW", "Grace Wambui", "Incoming", "Yesterday"],
  ];
  return (
    <div className="calls" aria-hidden="true">
      <div className="tablet">
        <header><b>SautiCall</b><span>Calls</span></header>
        <div className="tabs"><span className="on">All calls</span><span>Missed</span><span>Voicemail</span></div>
        {calls.map(([mark, name, kind, when]) => (
          <div key={name} className="person">
            <i>{mark}</i><span><b>{name}</b><small>{kind}</small></span><em>{when}</em>
          </div>
        ))}
      </div>
      <div className="phoneface">
        <small>9:41</small>
        <i>RW</i>
        <b>Ruth Wambui</b>
        <small>+254 712 345 678</small>
        <div className="eq"><i /><i /><i /><i /><i /></div>
        <span className="endcall" />
      </div>
    </div>
  );
}

export function HelpBubbles() {
  return (
    <div className="bubbles" aria-hidden="true">
      <div className="qmark">?</div>
      <div className="chatbubble" />
    </div>
  );
}

export function ExtTable() {
  const rows = [
    ["101", "Amina", "Online"],
    ["102", "Sales", "Online"],
    ["103", "Support", "Away"],
  ];
  return (
    <div className="ext-table" aria-hidden="true">
      <header><b>SautiCall</b><span>Extensions</span></header>
      <div className="ext-head"><span>Ext</span><span>Name</span><span>Status</span></div>
      {rows.map(([ext, name, state]) => (
        <div key={ext} className="ext-row"><span>{ext}</span><span>{name}</span><em className={state === "Away" ? "" : "ok"}>{state}</em></div>
      ))}
    </div>
  );
}

export function DevicePair() {
  return (
    <div className="device-pair" aria-hidden="true">
      <div className="handset big">
        <div className="hand" />
        <div className="base"><b>SautiCall</b><small>(302) 555-0101</small></div>
      </div>
      <div className="mobile tall">
        <b>SautiCall</b>
        <strong>(302) 555-0101</strong>
        <small>Answer · Route</small>
      </div>
    </div>
  );
}

export function AiCallCard() {
  return (
    <div className="ai-call" aria-hidden="true">
      <header><span className="orb sm">AI</span><div><b>SautiCall</b><small>Answering</small></div></header>
      <p className="ask">What are your hours?</p>
      <ul>
        <li>Answer common questions</li>
        <li>Take a message</li>
        <li>Route to the right person</li>
      </ul>
    </div>
  );
}

export function QueueCard() {
  const rows = [
    ["(302) 555-0101", "Waiting", "2 min"],
    ["(302) 555-0148", "With team", "6 min"],
    ["(302) 555-0172", "Completed", "12 min"],
  ];
  return (
    <div className="queue" aria-hidden="true">
      <header><b>Support queue</b><span>3 live</span></header>
      {rows.map(([num, state, time]) => (
        <div key={num} className="ext-row"><span>{num}</span><em className={state === "Waiting" ? "busy" : state === "Completed" ? "" : "ok"}>{state}</em><small>{time}</small></div>
      ))}
    </div>
  );
}

export function NumberPair() {
  return (
    <div className="number-pair">
      <article className="numsketch">
        <b>Get a business number</b>
        <div className="fake-search">(302) 555-01</div>
        <div><span>(302) 555-0101</span><em>Available</em></div>
        <div><span>(302) 555-0142</span><em>Available</em></div>
      </article>
      <article className="numsketch">
        <b>Bring your existing number</b>
        <div className="port-steps"><span className="on">Request</span><span>Review</span><span>Transfer</span><span>Activation</span></div>
        <p>Submit transfer details. We show each step in your account.</p>
      </article>
    </div>
  );
}

export function ExampleCall() {
  return (
    <div className="example-call" aria-hidden="true">
      <header>Example call</header>
      <div className="person"><i>AI</i><span><b>Receptionist</b><small>Thanks for calling. How can I help?</small></span></div>
      <p><b>Caller</b> Can I speak to sales?</p>
      <p className="result">Result · Transfer to Sales · Extension 514</p>
    </div>
  );
}

export function Unfold() {
  return (
    <div className="unfold" aria-hidden="true">
      <article className="u-card"><span className="feature-ico blue">In</span><b>Incoming caller</b><small>A customer calls your business.</small></article>
      <span className="u-arrow">→</span>
      <article className="u-card"><span className="orb sm">AI</span><b>AI receptionist</b><small>Thanks for calling. How can I help?</small></article>
      <span className="u-arrow">→</span>
      <div className="u-stack">
        <article><b>Answer a question</b><small>Share an approved answer.</small></article>
        <article><b>Connect to a person</b><small>Transfer to the right team or extension.</small></article>
        <article><b>Take a message</b><small>Capture caller details and their reason for calling.</small></article>
      </div>
    </div>
  );
}

export function AnswerCards() {
  return (
    <div className="pub-grid-3">
      <article className="pub-card sample">
        <h3>Your approved answers</h3>
        <p>Use your business information to answer common questions.</p>
        <dl>
          <div><dt>Business name</dt><dd>Riverside Dental</dd></div>
          <div><dt>Business hours</dt><dd>Mon–Fri, 8:00 am – 5:00 pm</dd></div>
          <div><dt>Address</dt><dd>123 Maple Ave, Riverton</dd></div>
          <div><dt>Services</dt><dd>General, Cosmetic, Emergency</dd></div>
        </dl>
      </article>
      <article className="pub-card sample">
        <h3>Your transfer destinations</h3>
        <p>Send callers to the right person or department.</p>
        <dl>
          <div><dt>Sales</dt><dd>Extension 514</dd></div>
          <div><dt>Support</dt><dd>Extension 515</dd></div>
        </dl>
      </article>
      <article className="pub-card sample">
        <h3>Your message preferences</h3>
        <p>Choose what details to capture when a message is taken.</p>
        <dl>
          <div><dt>Caller&apos;s name</dt><dd>Alex Carter</dd></div>
          <div><dt>Phone number</dt><dd>(555) 123-4567</dd></div>
          <div><dt>Reason for call</dt><dd>Interested in appointment availability</dd></div>
        </dl>
      </article>
    </div>
  );
}

export function SettingsPanel() {
  return (
    <div className="settings-panel" aria-hidden="true">
      <header><b>AI receptionist settings</b><span>Draft</span></header>
      <div className="set-grid">
        <nav>
          <span className="on">Greeting</span>
          <span>Business information</span>
          <span>Message settings</span>
          <span>After hours</span>
        </nav>
        <div>
          <label>Greeting<small>This is what callers hear when they call.</small></label>
          <p className="greet">Thanks for calling Riverside Dental. How can I help you today?</p>
          <label>Business hours</label>
          <p className="hours"><span>Mon–Fri</span><span>8:00 am</span><span>to</span><span>5:00 pm</span></p>
        </div>
      </div>
    </div>
  );
}

export function LanguageScene() {
  return (
    <div className="lang-scene" aria-hidden="true">
      <div className="globe" />
      <span className="lang l1">Hello</span>
      <span className="lang l2">Hola</span>
      <span className="lang l3">Bonjour</span>
      <span className="lang l4">Call</span>
    </div>
  );
}
