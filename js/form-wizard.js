/* ============================================================
   CONFLUENCE 2026 — form-wizard.js
   Guided registration journey (fields unchanged)
   ============================================================ */

/** Pass value copy — mirrors event.html pass cards */
const PASS_META = {
  'learning-lab': {
    shortName: 'Learning Lab',
    access: '3-day immersive workshop · Individual pass',
    valueLine: 'Hands-on workshops, masterclasses, and skill intensives designed to develop the next generation of leaders.',
    benefits: [
      'Letter of Recommendation from industry leaders',
      'Official certification of participation',
      'Internship opportunities (performance-based)',
      'Access to mentors across diverse sectors',
      'Awards and recognition for outstanding participants',
      'Curated goodies kit + snacks & lunch (3 days)',
    ],
  },
  'concept-cocoon': {
    shortName: 'Concept Cocoon',
    access: 'Competition day · Per startup / team',
    valueLine: 'Shark-tank-style pitch competition with VCs, angel investors, and seasoned entrepreneurs.',
    benefits: [
      'Mentorship access and funding opportunities',
      'Official certification for all participating teams',
      'Awards and recognition for winning teams',
      'Curated feedback from investors and entrepreneurs',
      'Curated goodies kit per team',
      'Snacks on competition day',
    ],
    note: '₹1,000 registration fee. Shortlisted teams pay an additional ₹4,000 for pitching.',
  },
  'networking-gala': {
    shortName: 'Networking Gala',
    access: 'Evening event · Individual pass',
    valueLine: 'An exclusive evening with industry leaders, corporate executives, and top-tier mentors.',
    benefits: [
      'Official certification of attendance',
      'Welcome snacks and welcome gift',
      'Networking with leaders, executives & mentors',
      'Mentor sessions including live Q&A with dignitaries',
    ],
    note: 'Invite-reviewed access. Limited seating — early registration advised.',
  },
};

const FIELD_STEPS = {
  'learning-lab': [
    { title: 'Basic Information', subtitle: 'Let\'s start with the essentials.', fields: ['full_name', 'email', 'phone'] },
    { title: 'Professional Information', subtitle: 'Tell us where you\'re from and what you do.', fields: ['college_company', 'city', 'experience_level', 'linkedin', 'instagram'] },
    { title: 'Motivation & Goals', subtitle: 'Share why you want to join the Learning Lab.', fields: ['why_attend', 'building', 'portfolio', 'dietary'] },
    { title: 'Learning Lab Details', subtitle: 'Your skills and workshop interests.', fields: ['skill_domain', 'workshops', 'current_projects'] },
    { title: 'Emergency Contact', subtitle: 'Someone we can reach in case of emergency.', fields: ['ec_name', 'ec_phone'] },
  ],
  'concept-cocoon': [
    { title: 'Basic Information', subtitle: 'Let\'s start with the essentials.', fields: ['full_name', 'email', 'phone'] },
    { title: 'Professional Information', subtitle: 'Tell us where you\'re from and what you do.', fields: ['college_company', 'city', 'experience_level', 'linkedin', 'instagram'] },
    { title: 'Motivation & Goals', subtitle: 'Share your vision and interests.', fields: ['why_attend', 'building', 'portfolio', 'dietary'] },
    { title: 'Your Startup Idea', subtitle: 'Tell us about your venture.', fields: ['startup_idea', 'idea_stage', 'team_size', 'funding_status'] },
    { title: 'Pitch Materials', subtitle: 'Share your pitch assets with us.', fields: ['pitch_deck_url', 'pitch_video_url', 'intro_video_url'] },
    { title: 'Emergency Contact', subtitle: 'Someone we can reach in case of emergency.', fields: ['ec_name', 'ec_phone'] },
  ],
  'networking-gala': [
    { title: 'Basic Information', subtitle: 'Let\'s start with the essentials.', fields: ['full_name', 'email', 'phone'] },
    { title: 'Professional Information', subtitle: 'Tell us where you\'re from and what you do.', fields: ['college_company', 'city', 'experience_level', 'linkedin', 'instagram'] },
    { title: 'Motivation & Goals', subtitle: 'Share why you want to attend the Gala.', fields: ['why_attend', 'building', 'portfolio', 'dietary'] },
    { title: 'Networking Profile', subtitle: 'Help us curate your connections.', fields: ['industry', 'mentor_domain', 'networking_goals'] },
    { title: 'Emergency Contact', subtitle: 'Someone we can reach in case of emergency.', fields: ['ec_name', 'ec_phone'] },
  ],
};

const WIZARD_ACCENT = {};

function buildWizardSteps(passType) {
  const meta = PASS_META[passType];
  const fields = FIELD_STEPS[passType] || [];
  return [
    {
      intro: true,
      title: `Your ${meta?.shortName || 'Confluence'} Pass`,
      subtitle: meta?.valueLine || 'Review what\'s included before you begin.',
    },
    ...fields,
    {
      review: true,
      title: 'Review & Confirmation',
      subtitle: 'Review your application before continuing.',
      fields: ['agree_terms'],
    },
    {
      completion: true,
      title: 'Application Complete',
      subtitle: 'Your pass is unlocked. Secure your spot to complete registration.',
    },
  ];
}

const WIZARD_CONFIG = Object.fromEntries(
  Object.keys(FIELD_STEPS).map(slug => [
    slug,
    { accent: WIZARD_ACCENT[slug], steps: buildWizardSteps(slug) },
  ]),
);

function findFieldGroup(form, fieldName) {
  const input = form.querySelector(`[name="${fieldName}"]`);
  if (!input) return null;
  return input.closest('.form-group')
    || input.closest('label.form-check')?.parentElement
    || input.parentElement;
}

function getFieldLabel(group) {
  if (!group) return '';
  const label = group.querySelector('.form-label');
  if (label) return label.textContent.replace(/\*/g, '').trim();
  if (group.querySelector('.form-check')) return 'Terms & Conditions';
  return '';
}

function getFieldDisplayValue(input) {
  if (!input) return '—';
  if (input.type === 'checkbox') return input.checked ? 'Agreed' : '—';
  if (input.tagName === 'SELECT') {
    const opt = input.options[input.selectedIndex];
    return opt && opt.value ? opt.textContent : '—';
  }
  const v = input.value.trim();
  if (!v) return '—';
  if (v.length > 120) return `${v.slice(0, 120)}…`;
  return v;
}

function isFieldStep(step) {
  return step && !step.intro && !step.review && !step.completion;
}

function calcProgress(completedFieldSteps, totalFieldSteps) {
  if (totalFieldSteps <= 0) return 0;
  return Math.floor((completedFieldSteps / totalFieldSteps) * 100);
}

function renderBenefitsList(benefits, max = 5) {
  return benefits.slice(0, max).map(b => `
    <li class="pass-benefit-item">
      <span class="pass-benefit-check" aria-hidden="true">✓</span>
      <span>${b}</span>
    </li>
  `).join('');
}

function renderIntroPanel(meta, passName) {
  const note = meta.note
    ? `<p class="wizard-intro-note">${meta.note}</p>`
    : '';
  return `
    <div class="wizard-intro">
      <p class="wizard-intro-lead">You're registering for <strong>${passName}</strong></p>
      <p class="wizard-intro-access">${meta.access}</p>
      <div class="wizard-intro-section-label">What's included</div>
      <ul class="wizard-intro-benefits">${renderBenefitsList(meta.benefits, 6)}</ul>
      ${note}
    </div>
  `;
}

function renderCompletionPanel(meta, passName) {
  return `
    <div class="wizard-completion">
      <div class="wizard-completion-icon" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h3 class="wizard-completion-heading">You're all set</h3>
      <p class="wizard-completion-body">
        Your <strong>${passName}</strong> application is complete.
        Your pass is unlocked — proceed to payment to secure your spot at Confluence 2026.
      </p>
      <div class="wizard-completion-pass-card">
        <div class="wizard-completion-pass-name">${passName}</div>
        <div class="wizard-completion-pass-access">${meta.access}</div>
      </div>
    </div>
  `;
}

function initFormWizard() {
  const form = document.getElementById('pass-form');
  if (!form || form.dataset.wizardInit) return;

  const passType = form.dataset.passType;
  const config = WIZARD_CONFIG[passType];
  const meta = PASS_META[passType];
  if (!config || !meta) return;

  form.dataset.wizardInit = 'true';

  const section = document.getElementById('form-section');
  const layout = section?.querySelector('.form-layout');
  if (!section || !layout) return;

  section.classList.add('wizard-active');

  const passIdentity = layout.querySelector('.pass-identity');
  const pageHeader = layout.querySelector('div[style*="margin-bottom:2rem"]');
  if (pageHeader) pageHeader.classList.add('wizard-page-header');

  const passTag = passIdentity?.querySelector('.pass-identity-tag')?.textContent || '';
  const passName = passIdentity?.querySelector('.pass-identity-name')?.textContent || meta.shortName;
  const passPrice = passIdentity?.querySelector('.pass-identity-price')?.innerHTML || '';
  const isGold = config.accent === 'gold' || passIdentity?.classList.contains('gold-accent');

  if (passIdentity) passIdentity.classList.add('wizard-hidden-original');
  form.querySelectorAll(':scope > .form-card').forEach(c => c.classList.add('wizard-hidden-original'));

  const steps = config.steps;
  const totalSteps = steps.length;
  const totalFieldSteps = steps.filter(isFieldStep).length;

  const shell = document.createElement('div');
  shell.className = `wizard-shell${isGold ? ' wizard-accent-gold' : ''}`;

  const left = document.createElement('div');
  left.className = 'wizard-left';
  left.innerHTML = `
    <div class="wizard-step-meta">
      <span class="wizard-step-count" id="wizard-step-count">Step 1 of ${totalSteps}</span>
      <div class="wizard-step-dots" id="wizard-step-dots"></div>
    </div>
    <h2 class="wizard-step-title" id="wizard-step-title"></h2>
    <p class="wizard-step-subtitle" id="wizard-step-subtitle"></p>
    <div id="wizard-step-panels"></div>
    <div class="wizard-nav">
      <button type="button" class="btn-back hidden" id="wizard-btn-back">← Back</button>
      <button type="button" class="btn btn-primary btn-lg" id="wizard-btn-next">Begin Application</button>
    </div>
  `;

  const right = document.createElement('div');
  right.className = 'wizard-right';
  right.innerHTML = `
    <div class="pass-unlock-panel${isGold ? ' accent-gold' : ''}" id="pass-unlock-panel" data-progress="0">
      <div class="pass-unlock-eyebrow">Unlock Your Pass</div>
      <div class="pass-unlock-ring">
        <svg viewBox="0 0 120 120">
          <circle class="pass-unlock-ring-bg" cx="60" cy="60" r="52"></circle>
          <circle class="pass-unlock-ring-fill" id="pass-unlock-ring-fill" cx="60" cy="60" r="52"
            stroke-dasharray="327" stroke-dashoffset="327"></circle>
        </svg>
        <div class="pass-unlock-percent" id="pass-unlock-percent">0%</div>
      </div>
      <div class="pass-unlock-card">
        <div class="pass-unlock-lock">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 118 0v4"/></svg>
        </div>
        <div class="pass-unlock-card-inner">
          <div class="pass-unlock-tag">${passTag}</div>
          <div class="pass-unlock-name">${passName}</div>
          <div class="pass-unlock-price">${passPrice}</div>
        </div>
      </div>
      <div class="pass-unlock-benefits" id="pass-unlock-benefits">
        <div class="pass-unlock-benefits-label">Included with your pass</div>
        <ul class="pass-unlock-benefits-list">${renderBenefitsList(meta.benefits, 3)}</ul>
      </div>
      <p class="pass-unlock-message" id="pass-unlock-message">Complete each step to unlock your Confluence Pass.</p>
    </div>
  `;

  shell.appendChild(left);
  shell.appendChild(right);
  form.insertBefore(shell, form.firstChild);

  const panelsEl = left.querySelector('#wizard-step-panels');
  const dotsEl = left.querySelector('#wizard-step-dots');

  steps.forEach((step, i) => {
    const dot = document.createElement('span');
    dot.className = 'wizard-step-dot' + (i === 0 ? ' active' : '');
    dotsEl.appendChild(dot);

    const panel = document.createElement('div');
    panel.className = 'wizard-step-panel' + (i === 0 ? ' active' : '');
    panel.dataset.stepIndex = String(i);

    if (step.intro) {
      panel.innerHTML = renderIntroPanel(meta, passName);
    } else if (step.completion) {
      panel.innerHTML = renderCompletionPanel(meta, passName);
    } else {
      if (step.review) {
        const reviewList = document.createElement('div');
        reviewList.className = 'wizard-review-list';
        reviewList.id = 'wizard-review-list';
        panel.appendChild(reviewList);
      }

      const grid = document.createElement('div');
      grid.className = 'form-grid';

      (step.fields || []).forEach(fieldName => {
        const group = findFieldGroup(form, fieldName);
        if (!group) return;
        if (fieldName !== 'agree_terms') group.classList.add('full');
        grid.appendChild(group);
      });

      if (grid.childElementCount > 0) panel.appendChild(grid);
    }

    panelsEl.appendChild(panel);
  });

  let currentStep = 0;
  const btnBack = left.querySelector('#wizard-btn-back');
  const btnNext = left.querySelector('#wizard-btn-next');
  const titleEl = left.querySelector('#wizard-step-title');
  const subtitleEl = left.querySelector('#wizard-step-subtitle');
  const countEl = left.querySelector('#wizard-step-count');
  const unlockPanel = right.querySelector('#pass-unlock-panel');
  const ringFill = right.querySelector('#pass-unlock-ring-fill');
  const percentEl = right.querySelector('#pass-unlock-percent');
  const messageEl = right.querySelector('#pass-unlock-message');
  const CIRC = 327;

  function countCompletedFieldSteps(beforeIndex) {
    let n = 0;
    for (let i = 0; i < beforeIndex; i++) {
      if (isFieldStep(steps[i])) n++;
    }
    return n;
  }

  function updateReviewList() {
    const list = document.getElementById('wizard-review-list');
    if (!list) return;
    list.innerHTML = '';
    steps.forEach(step => {
      if (!isFieldStep(step)) return;
      step.fields.forEach(fieldName => {
        const input = form.querySelector(`[name="${fieldName}"]`);
        const group = findFieldGroup(form, fieldName);
        if (!input || !group) return;
        const item = document.createElement('div');
        item.className = 'wizard-review-item';
        item.innerHTML = `
          <div class="wizard-review-label">${getFieldLabel(group)}</div>
          <div class="wizard-review-value">${getFieldDisplayValue(input)}</div>
        `;
        list.appendChild(item);
      });
    });
  }

  function updateUnlockUI(stepIndex) {
    const step = steps[stepIndex];
    let completed = countCompletedFieldSteps(stepIndex);

    if (step.review || step.completion) {
      completed = totalFieldSteps;
    }

    const pct = calcProgress(completed, totalFieldSteps);
    unlockPanel.dataset.progress = String(pct);
    unlockPanel.style.setProperty('--unlock-progress', String(pct));
    ringFill.style.strokeDashoffset = String(CIRC - (CIRC * pct) / 100);
    percentEl.textContent = `${pct}%`;

    unlockPanel.classList.toggle('unlocked', pct >= 100);
    unlockPanel.classList.toggle('celebrate', !!step.completion);

    if (step.completion) {
      messageEl.textContent = 'Pass unlocked! Proceed to payment when you\'re ready.';
    } else if (step.review) {
      messageEl.textContent = 'Almost there — confirm your details to unlock your pass.';
    } else if (pct >= 100) {
      messageEl.textContent = 'Your pass is unlocked.';
    } else if (pct >= 50) {
      messageEl.textContent = 'You\'re halfway there — keep going!';
    } else if (pct > 0) {
      messageEl.textContent = 'Your pass is taking shape…';
    } else {
      messageEl.textContent = 'Complete each step to unlock your Confluence Pass.';
    }
  }

  function getNextButtonLabel(step, stepIndex) {
    if (step.intro) return 'Begin Application';
    if (step.review) return 'Complete Application';
    if (step.completion) return 'Proceed to Payment';
    if (stepIndex === totalSteps - 2) return 'Complete Application';
    return 'Continue';
  }

  function showStep(index) {
    currentStep = index;
    left.classList.toggle('wizard-step-completion-active', !!steps[index].completion);

    panelsEl.querySelectorAll('.wizard-step-panel').forEach((p, i) => {
      p.classList.toggle('active', i === index);
    });
    dotsEl.querySelectorAll('.wizard-step-dot').forEach((d, i) => {
      d.classList.toggle('active', i === index);
      d.classList.toggle('done', i < index);
    });

    const step = steps[index];
    titleEl.textContent = step.title;
    subtitleEl.textContent = step.subtitle;
    countEl.textContent = `Step ${index + 1} of ${totalSteps}`;

    btnBack.classList.toggle('hidden', index === 0);
    btnNext.textContent = getNextButtonLabel(step, index);

    const isPayStep = step.completion;
    btnNext.className = isPayStep && isGold
      ? 'btn btn-gold btn-lg'
      : 'btn btn-primary btn-lg';

    updateUnlockUI(index);
    if (step.review) updateReviewList();

    if (step.completion) {
      if (window.matchMedia('(max-width: 960px)').matches) {
        unlockPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        right.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  btnBack.addEventListener('click', () => {
    if (currentStep > 0) showStep(currentStep - 1);
  });

  btnNext.addEventListener('click', async () => {
    const step = steps[currentStep];
    const panel = panelsEl.querySelector(`.wizard-step-panel[data-step-index="${currentStep}"]`);

    if (!step.intro && !step.completion) {
      const validateStepFn = window.formHelpers?.validateStep;
      if (validateStepFn && !validateStepFn(panel)) {
        toast.error('Please fix the errors above.', 'Validation Error');
        return;
      }
    }

    if (step.completion) {
      btnNext.disabled = true;
      btnNext.classList.add('btn-loading');
      const fakeEvent = { preventDefault: () => {}, target: form };
      try {
        await window.formHelpers.handleFormSubmit(fakeEvent, passType);
      } finally {
        btnNext.disabled = false;
        btnNext.classList.remove('btn-loading');
      }
      return;
    }

    if (currentStep < totalSteps - 1) {
      showStep(currentStep + 1);
    }
  });

  form.addEventListener('submit', (e) => e.preventDefault());
  showStep(0);
}

document.addEventListener('DOMContentLoaded', initFormWizard);

window.formWizard = { PASS_META, WIZARD_CONFIG, initFormWizard };
