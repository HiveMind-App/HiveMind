import java.util.Properties

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.21"
    id("org.jetbrains.intellij") version "1.17.4"
    id("org.jetbrains.kotlin.plugin.serialization") version "1.9.21"
}

// ── Credenciales ────────────────────────────────────────────────────────────
// Lee desde variables de entorno o desde supabase-config.properties (gitignored).
// El resultado se escribe en src/main/resources/hivemind-credentials.properties
// para que Config.kt lo cargue en runtime sin hardcodear nada.
val localPropsFile = file("supabase-config.properties")
val localProps = Properties().also { props ->
    if (localPropsFile.exists()) localPropsFile.inputStream().use { props.load(it) }
}
fun credential(envKey: String, propKey: String): String =
    System.getenv(envKey) ?: localProps.getProperty(propKey, "")

val credentialsResourceDir = layout.buildDirectory.dir("generated/resources")

val generateCredentials by tasks.registering {
    group = "hivemind"
    description = "Genera hivemind-credentials.properties desde env vars o supabase-config.properties"
    outputs.dir(credentialsResourceDir)
    doLast {
        val outDir = credentialsResourceDir.get().asFile
        outDir.mkdirs()
        val outFile = outDir.resolve("hivemind-credentials.properties")
        outFile.writeText(
            """
            # Generado por Gradle — NO editar manualmente.
            # Para cambiar los valores: edita supabase-config.properties o setea las env vars.
            SUPABASE_URL=${credential("HIVEMIND_SUPABASE_URL", "SUPABASE_URL")}
            SUPABASE_ANON_KEY=${credential("HIVEMIND_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY")}
            """.trimIndent() + "\n"
        )
        logger.lifecycle("[HiveMind] Credentials resource generado en $outFile")
    }
}

sourceSets.main {
    resources.srcDir(credentialsResourceDir)
}
// ── Fin credenciales ─────────────────────────────────────────────────────────

group   = "com.hivemind"
version = "1.0-HACKATHON"

repositories {
    mavenCentral()
    maven("https://jitpack.io")
}

dependencies {
    // Ktor Client — llamadas HTTP a Supabase Edge Functions, Trello, Slack
    implementation("io.ktor:ktor-client-cio:2.3.7")
    implementation("io.ktor:ktor-client-content-negotiation:2.3.7")
    implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.7")

    // Supabase Kotlin Client — Realtime + Postgrest
    implementation(platform("io.github.jan-tennert.supabase:bom:2.2.3"))
    implementation("io.github.jan-tennert.supabase:postgrest-kt")
    implementation("io.github.jan-tennert.supabase:realtime-kt")

    // Coroutines (alineadas con la versión de IntelliJ, provistas por la plataforma)
    compileOnly("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.6.4")
    compileOnly("org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.6.4")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.0")

    // Tests
    testImplementation("org.junit.jupiter:junit-jupiter-api:5.9.3")
    testRuntimeOnly("org.junit.jupiter:junit-jupiter-engine:5.9.3")
}

// EVITAR CHOQUE DE VERSIONES DE COROUTINES CON INTELLIJ
configurations.all {
    exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-coroutines-core")
    exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-coroutines-core-jvm")
    exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-coroutines-jdk8")
    exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-coroutines-jdk9")
    exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-coroutines-slf4j")
    exclude(group = "org.jetbrains.kotlinx", module = "kotlinx-coroutines-play-services")
    
    // EVITAR CHOQUE DE LOGGER (SLF4J) ENTRE KTOR E INTELLIJ
    exclude(group = "org.slf4j", module = "slf4j-api")
}

intellij {
    version.set("2023.2.5")
    type.set("IC")              // IC = IntelliJ Community
    plugins.set(listOf())
}

tasks {
    processResources {
        dependsOn(generateCredentials)
    }

    withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        kotlinOptions.jvmTarget = "17"
    }
    patchPluginXml {
        sinceBuild.set("232")
        untilBuild.set("")
    }
    
    // Deshabilitar instrumentCode para evitar errores con ciertos JDKs locales (como el MS JDK)
    instrumentCode {
        compilerVersion.set("")
        enabled = false
    }

    test {
        useJUnitPlatform()
    }
}
