"""
Backend/twilio_conference.py

Twilio SDK Conference Room & ElevenLabs Conversational Voice Routing Controller.
Handles SIP trunking, TwiML conference generation, and Supabase real-time notification sync.
"""

from typing import Dict, List, Optional
import time
from datetime import datetime

class TwilioConferenceController:
    """
    Manages Twilio Conference Rooms bridging PSTN lines to ElevenLabs Voice Agent endpoints.
    Allows administrators and QA supervisors to tap in muted for live QA monitoring.
    """
    def __init__(self):
        self.active_conferences: Dict[str, Dict] = {}

    def create_conference_twiml(self, room_twilio_id: str, muted: bool = False) -> str:
        """
        Generates TwiML XML response.
        If muted=True, supervisor joins in silent monitor mode with beep disabled.
        """
        muted_str = "true" if muted else "false"
        beep_str = "false"
        start_on_enter = "false" if muted else "true"

        return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <!-- Twilio Conference Room Leg -->
    <Dial>
        <Conference
            muted="{muted_str}"
            beep="{beep_str}"
            startConferenceOnEnter="{start_on_enter}"
            endConferenceOnExit="false"
            statusCallback="/api/twilio/voice/status"
        >{room_twilio_id}</Conference>
    </Dial>
</Response>"""

    def notify_supabase_room_id(self, room_twilio_id: str, event: str, metadata: Optional[Dict] = None):
        """
        Dispatches roomTwilioId event to Supabase Realtime broadcast channels or PostgreSQL
        table `live_voice_calls` so frontend subscribers can immediately display the live banner.
        """
        payload = {
            "room_twilio_id": room_twilio_id,
            "event": event,
            "timestamp": datetime.utcnow().isoformat(),
            "metadata": metadata or {}
        }
        # Direct Supabase client broadcast would occur here
        return payload

    def terminate_call(self, room_twilio_id: str, reason: str = "Completed"):
        """
        Terminates the Twilio conference. Supabase is notified with event 'call.ended',
        which signals the UI to trigger the banner fade-away animation.
        """
        return self.notify_supabase_room_id(
            room_twilio_id=room_twilio_id,
            event="call.ended",
            metadata={"reason": reason, "ended_at": datetime.utcnow().isoformat()}
        )
