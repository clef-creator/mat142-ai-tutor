export type TopicStatus = 'not_started' | 'shaky' | 'steady';

export interface WorkedExample {
  problem: string;
  answer: string;
  context?: string;
}

export interface Topic {
  id: string;
  deck: number;
  unit_title: string;
  order: number;
  title: string;
  student_facing_name: string;
  summary: string;
  notation: string[];
  method_steps: string[];
  worked_examples: WorkedExample[];
  applied_contexts: string[];
  prerequisites: string[];
  prereq_in_scope: string[];
  prereq_outside_scope: string[];
  common_errors: string[];
  geogebra_prompt?: string;
  /** Present on topics where the course notation departs from the standard one. */
  notation_warning?: string;
}

export interface Curriculum {
  course: string;
  institution: string;
  scope_note: string;
  decks: number[];
  verified_by_faculty: boolean;
  topics: Topic[];
}

export interface ProgressRow {
  student_id: string;
  topic_id: string;
  status: TopicStatus;
  attempts: number;
  last_worked_at: string | null;
  note: string | null;
}

export interface SessionRow {
  id: string;
  student_id: string;
  topic_id: string;
  started_at: string;
  ended_at: string | null;
  turn_count: number;
  outcome: TopicStatus | null;
  summary: string | null;
  sticking_point: string | null;
  asked_for_answers: boolean;
  self_critical: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
