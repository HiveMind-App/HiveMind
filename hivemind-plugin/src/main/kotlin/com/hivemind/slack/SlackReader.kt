package com.hivemind.slack

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

object SlackReader {
    private val _messages = MutableStateFlow<List<SlackMessage>>(emptyList())
    val messages: StateFlow<List<SlackMessage>> = _messages.asStateFlow()
    
    fun startPolling(intervalMs: Long = 5_000) {
        // Stub para hackathon
    }

    /** Formatea un timestamp de Slack (ej: 1712827230.0001) a HH:mm */
    fun formatTimestamp(ts: String?): String {
        if (ts.isNullOrEmpty()) return ""
        return try {
            val seconds = ts.substringBefore(".").toLong()
            val instant = Instant.ofEpochSecond(seconds)
            val formatter = DateTimeFormatter.ofPattern("HH:mm")
                .withZone(ZoneId.systemDefault())
            formatter.format(instant)
        } catch (e: Exception) {
            ""
        }
    }
}
