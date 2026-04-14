package com.hivemind.supabase

import com.hivemind.config.Config
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.realtime

/**
 * Singleton del cliente Supabase. Se inicializa una vez y se reutiliza.
 * Las credenciales vienen de Config (supabase-config.properties).
 * PROPIETARIO: Alejandro
 */
object SupabaseManager {

    val client = createSupabaseClient(
        supabaseUrl = Config.supabaseUrl,
        supabaseKey = Config.supabaseAnonKey
    ) {
        install(Postgrest)
        install(Realtime)
    }

    suspend fun connect() = client.realtime.connect()
    
    suspend fun disconnect() = client.realtime.disconnect()
}