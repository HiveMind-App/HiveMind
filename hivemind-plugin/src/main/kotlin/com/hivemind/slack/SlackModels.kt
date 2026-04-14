package com.hivemind.slack

import kotlinx.serialization.Serializable

@Serializable
data class SlackMessage(
    val text: String = "",
    val blocks: List<SlackBlock> = emptyList(),
    val username: String = "HiveMind Bot",
    val icon_emoji: String = ":robot_face:",
    val ts: String = "",
    val user: String = ""
)

@Serializable
data class SlackBlock(
    val type: String,
    val text: SlackText? = null,
    val fields: List<SlackText>? = null,
    val elements: List<SlackText>? = null
)

@Serializable
data class SlackText(
    val type: String,
    val text: String
)
