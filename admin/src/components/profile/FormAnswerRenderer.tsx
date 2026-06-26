import type { FormAnswer } from '../../lib/attendeeProfile';

function AnswerValue({ answer }: { answer: FormAnswer }) {
  if (answer.type === 'link' && typeof answer.value === 'string' && answer.value.startsWith('http')) {
    return (
      <a href={answer.value} target="_blank" rel="noopener noreferrer" className="form-answer-link">
        {answer.display_value}
      </a>
    );
  }

  if (answer.type === 'textarea') {
    return <p className="form-answer-textarea">{answer.display_value}</p>;
  }

  if (answer.type === 'checkbox') {
    return <p className="form-answer-value">{answer.display_value}</p>;
  }

  return <p className="form-answer-value">{answer.display_value}</p>;
}

export function FormAnswerRenderer({ answers }: { answers: FormAnswer[] }) {
  if (answers.length === 0) {
    return <p className="muted">No responses recorded.</p>;
  }

  const sections = new Map<string, FormAnswer[]>();
  for (const answer of answers) {
    const key = answer.section ?? 'Other';
    const group = sections.get(key) ?? [];
    group.push(answer);
    sections.set(key, group);
  }

  return (
    <div className="form-answers">
      {[...sections.entries()].map(([section, sectionAnswers]) => (
        <div key={section} className="form-answers-section">
          {sections.size > 1 && <h4 className="form-answers-section-title">{section}</h4>}
          <dl className="form-answers-list">
            {sectionAnswers.map((answer) => (
              <div key={answer.field_key} className="form-answer-row">
                <dt>{answer.label}</dt>
                <dd><AnswerValue answer={answer} /></dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
