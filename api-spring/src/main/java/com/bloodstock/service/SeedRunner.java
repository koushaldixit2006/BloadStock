package com.bloodstock.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("seed")
public class SeedRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedRunner.class);

    private final SeedService seedService;

    public SeedRunner(SeedService seedService) {
        this.seedService = seedService;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.info("Executing SeedRunner under profile 'seed'...");
        SeedCounts counts = seedService.runSeed();
        System.out.println("SEED_SUMMARY_START");
        System.out.println("Hospitals: " + counts.hospitals());
        System.out.println("Routes: " + counts.routes());
        System.out.println("Units: " + counts.units());
        System.out.println("Requests: " + counts.requests());
        System.out.println("Users: " + counts.users());
        System.out.println("SimState: " + counts.simState());
        System.out.println("AuditLogs: " + counts.auditLogs());
        System.out.println("GenesisHash: " + counts.genesisHash());
        if (counts.heroUnitNearest() != null) {
            System.out.println("HeroUnitNearest: " + counts.heroUnitNearest().getId() + " at " + counts.heroUnitNearest().getHospitalId() + " expiresAt " + counts.heroUnitNearest().getExpiresAt());
        }
        if (counts.heroUnitFarther() != null) {
            System.out.println("HeroUnitFarther: " + counts.heroUnitFarther().getId() + " at " + counts.heroUnitFarther().getHospitalId() + " expiresAt " + counts.heroUnitFarther().getExpiresAt());
        }
        if (counts.criticalRequest() != null) {
            System.out.println("CriticalRequest: " + counts.criticalRequest().getId() + " at " + counts.criticalRequest().getHospitalId() + " for " + counts.criticalRequest().getGroup() + " " + counts.criticalRequest().getComponent());
        }
        System.out.println("SEED_SUMMARY_END");
    }
}
