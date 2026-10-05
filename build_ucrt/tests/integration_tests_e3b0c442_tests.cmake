add_test([=[ReplicationIntegrationTest.PrimaryReplicaStateConsistencyAndPartialResync]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/integration_tests.exe [==[--gtest_filter=ReplicationIntegrationTest.PrimaryReplicaStateConsistencyAndPartialResync]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[ReplicationIntegrationTest.PrimaryReplicaStateConsistencyAndPartialResync]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\integration\replication_test.cpp:18]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[CrashTest.TruncatedAofRecovery]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/integration_tests.exe [==[--gtest_filter=CrashTest.TruncatedAofRecovery]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[CrashTest.TruncatedAofRecovery]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\integration\crash_test.cpp:30]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[CrashTest.CorruptedRdbRefusesStartup]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/integration_tests.exe [==[--gtest_filter=CrashTest.CorruptedRdbRefusesStartup]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[CrashTest.CorruptedRdbRefusesStartup]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\integration\crash_test.cpp:57]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[EvictionTest.NoEvictionReturnsOOM]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/integration_tests.exe [==[--gtest_filter=EvictionTest.NoEvictionReturnsOOM]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[EvictionTest.NoEvictionReturnsOOM]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\integration\eviction_test.cpp:12]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[EvictionTest.SampledLRUEviction]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/integration_tests.exe [==[--gtest_filter=EvictionTest.SampledLRUEviction]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[EvictionTest.SampledLRUEviction]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\integration\eviction_test.cpp:41]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[StorageServerIntegrationTest.BasicStorageOperationsOverRESP]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/integration_tests.exe [==[--gtest_filter=StorageServerIntegrationTest.BasicStorageOperationsOverRESP]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[StorageServerIntegrationTest.BasicStorageOperationsOverRESP]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\integration\storage_test.cpp:101]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[RespServerIntegrationTest.PingAndEchoRESP]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/integration_tests.exe [==[--gtest_filter=RespServerIntegrationTest.PingAndEchoRESP]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[RespServerIntegrationTest.PingAndEchoRESP]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\integration\resp_test.cpp:114]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[EchoServerIntegrationTest.SingleConnectionEcho]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/integration_tests.exe [==[--gtest_filter=EchoServerIntegrationTest.SingleConnectionEcho]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[EchoServerIntegrationTest.SingleConnectionEcho]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\integration\echo_test.cpp:72]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[EchoServerIntegrationTest.ConcurrentClientsEcho]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/integration_tests.exe [==[--gtest_filter=EchoServerIntegrationTest.ConcurrentClientsEcho]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[EchoServerIntegrationTest.ConcurrentClientsEcho]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\integration\echo_test.cpp:99]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[EchoServerIntegrationTest.MaxClientsEnforcement]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/integration_tests.exe [==[--gtest_filter=EchoServerIntegrationTest.MaxClientsEnforcement]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[EchoServerIntegrationTest.MaxClientsEnforcement]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\integration\echo_test.cpp:137]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
set(integration_tests_TESTS [==[ReplicationIntegrationTest.PrimaryReplicaStateConsistencyAndPartialResync]==] [==[CrashTest.TruncatedAofRecovery]==] [==[CrashTest.CorruptedRdbRefusesStartup]==] [==[EvictionTest.NoEvictionReturnsOOM]==] [==[EvictionTest.SampledLRUEviction]==] [==[StorageServerIntegrationTest.BasicStorageOperationsOverRESP]==] [==[RespServerIntegrationTest.PingAndEchoRESP]==] [==[EchoServerIntegrationTest.SingleConnectionEcho]==] [==[EchoServerIntegrationTest.ConcurrentClientsEcho]==] [==[EchoServerIntegrationTest.MaxClientsEnforcement]==])
