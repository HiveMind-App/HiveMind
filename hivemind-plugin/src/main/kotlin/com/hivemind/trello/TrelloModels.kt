package com.hivemind.trello

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class TrelloCard(
    val id: String = "",
    val name: String,
    val desc: String = "",
    @SerialName("idList") val listId: String = "",
    @SerialName("idMembers") val memberIds: List<String> = emptyList(),
    val url: String = ""
)

@Serializable
data class TrelloList(
    val id: String,
    val name: String,
    val closed: Boolean = false
)

@Serializable
data class TrelloMember(
    val id: String,
    val fullName: String,
    val username: String
)

// Request para crear tarjeta
@Serializable
data class CreateCardRequest(
    val name: String,
    val desc: String,
    @SerialName("idList") val listId: String,
    @SerialName("idMembers") val memberIds: List<String> = emptyList()
)
