pipeline {
    agent any

    environment {
        REPO_OWNER   = 'adsecurto-boop'
        REPO_NAME    = 'PAIOS-4.5'
        
        // Java & Android SDK paths for Windows Jenkins Agents
        JAVA_HOME    = "${env.JAVA_HOME ?: 'C:\\Program Files\\Java\\jdk-17'}"
        ANDROID_HOME = "${env.ANDROID_HOME ?: env.ANDROID_SDK_ROOT ?: 'C:\\Users\\Administrator\\AppData\\Local\\Android\\Sdk'}"
        
        // Update PATH with Java and Android SDK tool binaries
        PATH         = "${env.JAVA_HOME}\\bin;${env.ANDROID_HOME}\\platform-tools;${env.ANDROID_HOME}\\tools\\bin;${env.PATH}"
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '15'))
        disableConcurrentBuilds()
        timeout(time: 45, unit: 'MINUTES')
    }

    triggers {
        githubPush()
        pollSCM('H/5 * * * *')
    }

    stages {
        stage('Notify GitHub - Pending') {
            steps {
                script {
                    updateGitHubCommitStatus('PENDING', 'Android & Desktop unified build in progress...')
                }
            }
        }

        stage('Checkout SCM') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                echo "=== Installing Dependencies ==="
                bat '''
                @echo off
                echo [INFO] Installing dependencies with --ignore-scripts...
                if exist package-lock.json (
                    call npm ci --ignore-scripts || call npm install --ignore-scripts --no-audit --no-fund
                ) else (
                    call npm install --ignore-scripts --no-audit --no-fund
                )
                '''
            }
        }

        stage('Lint & Unit Tests') {
            steps {
                echo "=== Running Linter & Unit Tests ==="
                bat 'npm run lint'
                bat 'npm run test'
            }
        }

        stage('Compile Core Web Distribution') {
            steps {
                echo "=== Compiling Production Web Assets ==="
                bat 'npm run build'
                
                // Generate In-App Update Manifest (version.json)
                powershell '''
                Compress-Archive -Path "dist/*" -DestinationPath "dist/PAIOS-Web-Dist.zip" -Force
                $manifest = @"
{
  "version": "4.5.2",
  "buildNumber": "$($env:BUILD_NUMBER)",
  "buildTimestamp": $([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()),
  "gitCommit": "$($env:GIT_COMMIT)",
  "releaseDate": "$(Get-Date -Format "yyyy-MM-dd HH:mm:ss UTC")",
  "releaseNotes": "PAIOS Multi-Platform Build #$($env:BUILD_NUMBER) (Commit $($env:GIT_COMMIT))",
  "mandatory": false,
  "platforms": {
    "windows": {
      "url": "http://localhost:8080/job/PAIOS-MultiPlatform-Pipeline/lastSuccessfulBuild/artifact/dist-electron/PAIOS-Desktop-Windows-x64.zip",
      "webDistUrl": "http://localhost:8080/job/PAIOS-MultiPlatform-Pipeline/lastSuccessfulBuild/artifact/dist/PAIOS-Web-Dist.zip",
      "filename": "PAIOS-Desktop-Windows-x64.zip",
      "version": "4.5.2"
    },
    "android": {
      "url": "http://localhost:8080/job/PAIOS-MultiPlatform-Pipeline/lastSuccessfulBuild/artifact/android/app/build/outputs/apk/release/app-release.apk",
      "debugUrl": "http://localhost:8080/job/PAIOS-MultiPlatform-Pipeline/lastSuccessfulBuild/artifact/android/app/build/outputs/apk/debug/app-debug.apk",
      "filename": "app-release.apk",
      "version": "4.5.2"
    }
  }
}
"@
                Set-Content -Path "dist/version.json" -Value $manifest
                Set-Content -Path "version.json" -Value $manifest
                Write-Output "[INFO] Generated update manifests at dist/version.json and version.json"
                '''
            }
        }

        stage('Parallel Platforms Build') {
            parallel {
                stage('Android Build') {
                    steps {
                        echo "=== Preparing & Compiling Android Release and Debug APKs ==="
                        
                        // 1. Sync Capacitor web assets to Android project
                        bat 'npx cap sync android'
                        
                        // 2. Generate Firebase Configuration (google-services.json)
                        powershell '''
                        $absolutePath = Join-Path $pwd "android/app/google-services.json"
                        $parentDir = Split-Path $absolutePath -Parent
                        
                        if (!(Test-Path $parentDir)) {
                            New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
                        }
                        
                        $jsonContent = @'
{
  "project_info": {
    "project_number": "97625194970",
    "project_id": "paios-app",
    "storage_bucket": "paios-app.firebasestorage.app"
  },
  "client": [
    {
      "client_info": {
        "mobilesdk_app_id": "1:97625194970:android:94f6f1108672eec72580e3",
        "android_client_info": {
          "package_name": "com.paios.app"
        }
      },
      "oauth_client": [
        {
          "client_id": "97625194970-bdmi8qk7ppe067gd240ibpu15jhrhcpo.apps.googleusercontent.com",
          "client_type": 3
        }
      ],
      "api_key": [
        {
          "current_key": "AIzaSyDWFAeBPx4cqE5didGnl3bYJYndB8Ucbgk"
        }
      ],
      "services": {
        "appinvite_service": {
          "other_platform_oauth_client": [
            {
              "client_id": "97625194970-bdmi8qk7ppe067gd240ibpu15jhrhcpo.apps.googleusercontent.com",
              "client_type": 3
            }
          ]
        }
      }
    }
  ],
  "configuration_version": "1"
}
'@
                        [System.IO.File]::WriteAllText($absolutePath, $jsonContent, [System.Text.Encoding]::UTF8)
                        Write-Output "[INFO] Synchronized $absolutePath with Firebase configuration."
                        '''

                        // 3. Verify Launcher Icons & XML Resources
                        powershell '''
                        $resPath = Join-Path $pwd "android/app/src/main/res"
                        
                        function Create-Folder($dir) {
                            if (!(Test-Path $dir)) {
                                New-Item -ItemType Directory -Path $dir -Force | Out-Null
                            }
                        }
                        
                        $densities = @(
                            @{ Name = "mipmap-mdpi"; Size = 48 },
                            @{ Name = "mipmap-hdpi"; Size = 72 },
                            @{ Name = "mipmap-xhdpi"; Size = 96 },
                            @{ Name = "mipmap-xxhdpi"; Size = 144 },
                            @{ Name = "mipmap-xxxhdpi"; Size = 192 }
                        )
                        
                        Create-Folder (Join-Path $resPath "drawable")
                        Create-Folder (Join-Path $resPath "mipmap-anydpi-v26")
                        
                        $bgXml = @'
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#3D5AFE"
        android:pathData="M0,0h108v108H0z"/>
</vector>
'@
                        [System.IO.File]::WriteAllText((Join-Path $resPath "drawable/ic_launcher_background.xml"), $bgXml, [System.Text.Encoding]::UTF8)

                        $fgXml = @'
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M30,30h48v48H30z"/>
</vector>
'@
                        [System.IO.File]::WriteAllText((Join-Path $resPath "drawable/ic_launcher_foreground.xml"), $fgXml, [System.Text.Encoding]::UTF8)

                        $adaptiveXml = @'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
'@
                        [System.IO.File]::WriteAllText((Join-Path $resPath "mipmap-anydpi-v26/ic_launcher.xml"), $adaptiveXml, [System.Text.Encoding]::UTF8)
                        [System.IO.File]::WriteAllText((Join-Path $resPath "mipmap-anydpi-v26/ic_launcher_round.xml"), $adaptiveXml, [System.Text.Encoding]::UTF8)

                        Add-Type -AssemblyName System.Drawing
                        
                        foreach ($d in $densities) {
                            $dir = Join-Path $resPath $d.Name
                            Create-Folder $dir
                            
                            $size = $d.Size
                            $targets = @("ic_launcher.png", "ic_launcher_round.png")
                            
                            foreach ($t in $targets) {
                                $targetPath = Join-Path $dir $t
                                if (!(Test-Path $targetPath)) {
                                    $bmp = New-Object System.Drawing.Bitmap($size, $size)
                                    $g = [System.Drawing.Graphics]::FromImage($bmp)
                                    $g.Clear([System.Drawing.Color]::FromArgb(255, 61, 90, 254))
                                    $bmp.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
                                    $g.Dispose()
                                    $bmp.Dispose()
                                }
                            }
                        }
                        Write-Output "[INFO] Android launcher icons and XML resources verified."
                        '''

                        // 4. Compile Android APKs via Gradle (assembleDebug & assembleRelease)
                        dir('android') {
                            bat '''
                            @echo off
                            echo [STATUS] Compiling Android APKs (assembleDebug assembleRelease)...
                            if exist gradlew.bat (
                                echo [INFO] Local gradlew.bat found. Assembling APKs...
                                call gradlew.bat assembleDebug assembleRelease --no-daemon --stacktrace
                            ) else (
                                echo [INFO] Executing global gradle assembleDebug assembleRelease...
                                call gradle assembleDebug assembleRelease --no-daemon --stacktrace
                            )
                            '''
                        }
                    }
                }

                stage('Desktop Build') {
                    steps {
                        echo "=== Packaging PAIOS Desktop for Windows (x64) ==="
                        powershell '''
                        $ErrorActionPreference = 'Continue'
                        Write-Output "[INFO] Packaging Electron Desktop App..."
                        if (Test-Path "dist-electron") {
                            Remove-Item -Recurse -Force "dist-electron" -ErrorAction SilentlyContinue
                        }
                        New-Item -ItemType Directory -Path "dist-electron" -Force | Out-Null

                        # Execute Electron Packager build command safely
                        cmd.exe /c "npm run build:exe" 2>&1 | Out-Default

                        # Locate packaged directory and compress into ZIP archive
                        $packDir = Get-ChildItem -Path "dist-electron" -Directory | Where-Object { $_.Name -like "*PAIOS Desktop*" } | Select-Object -First 1
                        if ($packDir) {
                            $zipPath = Join-Path $pwd "dist-electron/PAIOS-Desktop-Windows-x64.zip"
                            if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
                            Compress-Archive -Path "$($packDir.FullName)/*" -DestinationPath $zipPath -Force
                            Write-Output "[SUCCESS] Desktop archive generated at: $zipPath"
                        } else {
                            Write-Output "[WARN] Packaged folder not found in dist-electron."
                        }

                        # Generate build info metadata
                        $buildInfo = @"
PAIOS Unified Multi-Platform Build
Commit: $($env:GIT_COMMIT)
Branch: $($env:GIT_BRANCH)
Build Number: $($env:BUILD_NUMBER)
Date: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss UTC")
Platform: Windows x64 Desktop
"@
                        Set-Content -Path "dist-electron/BUILD_INFO.txt" -Value $buildInfo
                        Write-Output "[INFO] Generated dist-electron/BUILD_INFO.txt"
                        '''
                    }
                }
            }
        }

        stage('Archive Artifacts') {
            steps {
                echo "=== Archiving Android & Desktop Output Artifacts ==="
                archiveArtifacts artifacts: 'android/app/build/outputs/apk/**/*.apk, dist-electron/**/*.exe, dist-electron/**/*.zip, dist/**/*.zip, dist-electron/BUILD_INFO.txt, dist/version.json, version.json', allowEmptyArchive: true
            }
        }
    }

    post {
        always {
            script {
                echo 'Performing post-build ephemeral cache cleanup...'
                try {
                    bat 'if exist android\\app\\build\\tmp ( rmdir /s /q android\\app\\build\\tmp )'
                } catch (Exception e) {
                    echo "Cleanup notice: ${e.message}"
                }
            }
        }
        success {
            script {
                updateGitHubCommitStatus('SUCCESS', 'Android & Desktop build completed successfully!')
            }
            echo 'PAIOS Android & Desktop Pipelines Completed Successfully.'
        }
        failure {
            script {
                updateGitHubCommitStatus('FAILURE', 'Pipeline failed during Android or Desktop build stage.')
            }
            echo 'PAIOS Build Pipeline Failed. Check Jenkins console for logs.'
        }
    }
}

void updateGitHubCommitStatus(String state, String description) {
    def context = 'Jenkins/PAIOS-MultiPlatform'
    def repoOwner = env.REPO_OWNER ?: 'adsecurto-boop'
    def repoName = env.REPO_NAME ?: 'PAIOS-4.5'
    
    try {
        def remoteUrl = bat(script: 'git config --get remote.origin.url', returnStdout: true).trim()
        def matcher = remoteUrl =~ /(?:github\.com[:\/])([^\/]+)\/([^\/\.]+?)(?:\.git)?\s*$/
        if (matcher) {
            repoOwner = matcher[0][1].trim()
            repoName  = matcher[0][2].trim()
        }
    } catch (Exception e) {
        echo "Defaulting repository context: ${repoOwner}/${repoName}"
    }

    def commitSha = env.GIT_COMMIT
    if (!commitSha) {
        try {
            commitSha = bat(script: 'git rev-parse HEAD', returnStdout: true).trim()
        } catch (Exception e) {
            echo "Skipping status update: commitSha unavailable."
            return
        }
    }
    
    try {
        withCredentials([string(credentialsId: 'github-pat-token', variable: 'GITHUB_TOKEN')]) {
            if (env.GITHUB_TOKEN && commitSha) {
                def targetUrl = "${env.BUILD_URL}console"
                def payload = """{\"state\": \"${state.toLowerCase()}\", \"target_url\": \"${targetUrl}\", \"description\": \"${description}\", \"context\": \"${context}\"}"""
                
                try {
                    powershell """
                    \$headers = @{
                        "Authorization" = "token \$env:GITHUB_TOKEN"
                        "Accept" = "application/vnd.github.v3+json"
                        "Content-Type" = "application/json"
                    }
                    \$body = '${payload}'
                    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                    Invoke-RestMethod -Uri "https://api.github.com/repos/${repoOwner}/${repoName}/statuses/${commitSha}" -Method Post -Headers \$headers -Body \$body | Out-Null
                    Write-Output "[INFO] Successfully updated GitHub commit status for ${commitSha} to ${state}"
                    """
                } catch (Exception e) {
                    echo "Warning: GitHub commit status notification failed via PowerShell, attempting fallback: ${e.message}"
                    try {
                        bat "curl -f -X POST -H \"Authorization: token %GITHUB_TOKEN%\" -H \"Accept: application/vnd.github.v3+json\" -H \"Content-Type: application/json\" -d \"${payload.replace('"', '\\"')}\" https://api.github.com/repos/${repoOwner}/${repoName}/statuses/${commitSha}"
                    } catch (Exception curlErr) {
                        echo "Warning: GitHub commit status notification curl fallback failed: ${curlErr.message}"
                    }
                }
            } else {
                echo "Warning: GITHUB_TOKEN or commitSha not available. Skipping GitHub status notification."
            }
        }
    } catch (Exception e) {
        echo "Jenkins credential 'github-pat-token' notice: ${e.message}"
    }
}
