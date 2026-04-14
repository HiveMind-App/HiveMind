package com.hivemind.config

/**
 * Credenciales del backend HiveMind.
 *
 * Los valores se inyectan en tiempo de compilación desde:
 *   1. Variables de entorno HIVEMIND_SUPABASE_URL / HIVEMIND_SUPABASE_ANON_KEY
 *   2. Fichero local supabase-config.properties (gitignored — ver template)
 *
 * El Gradle task `generateCredentials` (build.gradle.kts) escribe
 * hivemind-credentials.properties en resources antes de compilar.
 *
 * Si ninguna fuente provee los valores, el plugin arrancará con strings
 * vacías y mostrará un banner de configuración al usuario.
 */
object Config {
    val supabaseUrl: String
    val supabaseAnonKey: String

    init {
        val props = java.util.Properties()
        Config::class.java
            .getResourceAsStream("/hivemind-credentials.properties")
            ?.use { props.load(it) }
        supabaseUrl = props.getProperty("SUPABASE_URL", "")
        supabaseAnonKey = props.getProperty("SUPABASE_ANON_KEY", "")
    }
}
