package com.bloodstock.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@ConfigurationProperties(prefix = "bloodstock")
@Validated
public class AppConfig {

    private int port = 8080;

    @NotBlank(message = "MongoDB URI is required")
    private String mongodbUri = "mongodb://127.0.0.1:27017/bloodstock?replicaSet=rs0";

    @NotBlank(message = "Optimizer URL is required")
    private String optimizerUrl = "http://127.0.0.1:8000";

    @NotBlank(message = "Internal Secret is required")
    private String internalSecret = "bloodstock-dev-secret-key-32chars-min";

    @NotBlank(message = "JWT Access Secret is required")
    private String jwtAccessSecret = "super-secret-jwt-key-for-bloodstock-planning-token-32c";

    @NotBlank(message = "JWT Refresh Secret is required")
    private String jwtRefreshSecret = "super-secret-refresh-key-for-bloodstock-planning-token-32c";

    @NotBlank(message = "Shared Rules Path is required")
    private String sharedRulesPath = "../shared/rules.json";

    @NotBlank(message = "CORS Origin is required")
    private String corsOrigin = "http://localhost:5173";

    private boolean rateLimitingEnabled = true;

    public int getPort() { return port; }
    public void setPort(int port) { this.port = port; }

    public String getMongodbUri() { return mongodbUri; }
    public void setMongodbUri(String mongodbUri) { this.mongodbUri = mongodbUri; }

    public String getOptimizerUrl() { return optimizerUrl; }
    public void setOptimizerUrl(String optimizerUrl) { this.optimizerUrl = optimizerUrl; }

    public String getInternalSecret() { return internalSecret; }
    public void setInternalSecret(String internalSecret) { this.internalSecret = internalSecret; }

    public String getJwtAccessSecret() { return jwtAccessSecret; }
    public void setJwtAccessSecret(String jwtAccessSecret) { this.jwtAccessSecret = jwtAccessSecret; }

    public String getJwtRefreshSecret() { return jwtRefreshSecret; }
    public void setJwtRefreshSecret(String jwtRefreshSecret) { this.jwtRefreshSecret = jwtRefreshSecret; }

    public String getSharedRulesPath() { return sharedRulesPath; }
    public void setSharedRulesPath(String sharedRulesPath) { this.sharedRulesPath = sharedRulesPath; }

    public String getCorsOrigin() { return corsOrigin; }
    public void setCorsOrigin(String corsOrigin) { this.corsOrigin = corsOrigin; }

    public boolean isRateLimitingEnabled() { return rateLimitingEnabled; }
    public void setRateLimitingEnabled(boolean rateLimitingEnabled) { this.rateLimitingEnabled = rateLimitingEnabled; }
}
