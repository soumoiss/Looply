plugins {
    id("com.android.application") version "9.4.1"
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
        applicationId = "com.soumoiss.looply"
        minSdk = 24
        targetSdk = 36
        versionCode = 301
        versionName = "3.0.1"
    }

    buildFeatures {
        buildConfig = true
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
}

tasks.named("preBuild").configure {
    dependsOn(buildLooplyWeb)
}
