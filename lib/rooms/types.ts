/**
 * Live Rooms: provider-neutral shapes. Browser-safe.
 * A room is one live conversation (a phone call in or out, or a browser call). Providers
 * plug in through adapters and declare what they support.
 */

export type RoomKind = 'phone_in' | 'phone_out' | 'browser';
export type RoomStatus = 'ringing' | 'live' | 'ended' | 'failed';
export type ParticipantRole = 'customer' | 'agent' | 'staff' | 'listener' | 'coach';
export type VoiceAgentMode = 'elevenlabs' | 'turn_based';

export interface RoomCapabilities {
  /** A participant can whisper to one other participant (Twilio "coach"). */
  supportsCoach: boolean;
  /** Ear can tell speakers apart (one track per role). */
  perSpeakerTranscript: boolean;
  /** People can join from the browser (listen in). */
  listenIn: boolean;
}

export const TWILIO_CONFERENCE_CAPABILITIES: RoomCapabilities = { supportsCoach: true, perSpeakerTranscript: true, listenIn: true };
/** Turn-based calls run TwiML on the caller's leg directly (no conference). */
export const TURN_BASED_CAPABILITIES: RoomCapabilities = { supportsCoach: false, perSpeakerTranscript: true, listenIn: false };

export interface CallingHours {
  timezone: string;
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  start: string; // HH:MM
  end: string; // HH:MM
}

export type Trigger =
  | { type: 'keyword'; any: string[]; role?: ParticipantRole | null }
  | { type: 'silence'; role: ParticipantRole; seconds: number }
  | { type: 'every'; seconds: number };

export const ROLE_LABEL: Record<string, string> = {
  customer: 'Customer',
  agent: 'AI agent',
  staff: 'Staff',
  listener: 'Listener',
  coach: 'Coach',
};
