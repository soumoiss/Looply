plugins {
    id("com.android.application") version "9.4.1"
    id("com.google.gms.google-services") version "4.5.0"
}

val repositoryRoot = rootProject.projectDir.parentFile
val webOutputDirectory = repositoryRoot.resolve("dist")
val nodeExecutable = providers.gradleProperty("looply.nodeExecutable").orElse("node")

val buildLooplyWeb by tasks.registering(Exec::class) {
    group = "build"
    description = "Builds the existing Looply web application for the bundled WebView."
    workingDir(repositoryRoot)
    commandLine(nodeExecutable.get(), "scripts/build.mjs")
    inputs.file(repositoryRoot.resolve("scripts/build.mjs"))
    inputs.file(repositoryRoot.resolve("config.js"))
    inputs.dir(repositoryRoot.resolve("src"))
    inputs.dir(repositoryRoot.resolve("assets"))
    inputs.files(
        listOf(
            "index.html", "login.html", "home.html", "musicas.html",
            "chat.html", "conversa.html", "cartas.html", "notificacoes.html",
            "usuarios.html", "configuracoes.html", "perfil.html", "admin.html",
            "styles.css"
        ).map(repositoryRoot::resolve)
    )
    outputs.dir(webOutputDirectory)
}

android {
    namespace = "com.soumoiss.looply"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.looply.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 302
        versionName = "3.0.2"
    }

    buildFeatures {
        buildConfig = true
    }

    // Signing uses persistent GitHub Actions secrets; never generate ephemeral release keys.
    val keyPath = System.getenv("LOOPLY_ANDROID_KEYSTORE_FILE")
    val keyStorePassword = System.getenv("LOOPLY_ANDROID_KEYSTORE_PASSWORD")
    val keyAlias = System.getenv("LOOPLY_ANDROID_KEY_ALIAS")
    val keyPassword = System.getenv("LOOPLY_ANDROID_KEY_PASSWORD")
    if (listOf(keyPath, keyStorePassword, keyAlias, keyPassword).all { !it.isNullOrBlank() }) {
        signingConfigs {
            create("looplyProduction") {
                storeFile = file(keyPath!!)
                storePassword = keyStorePassword
                this.keyAlias = keyAlias
                this.keyPassword = keyPassword
            }
        }
        buildTypes {
            getByName("release") {
                signingConfig = signingConfigs.getByName("looplyProduction")
            }
        }
    }

    sourceSets.getByName("main").assets.srcDir(webOutputDirectory)

    packaging {
        resources {
            excludes += setOf("META-INF/DEPENDENCIES", "META-INF/LICENSE*", "META-INF/NOTICE*")
        }
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.15.0")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation(platform("com.google.firebase:firebase-bom:35.1.0"))
    implementation("com.google.firebase:firebase-messaging")
}

tasks.named("preBuild").configure {
    dependsOn(buildLooplyWeb)
}
