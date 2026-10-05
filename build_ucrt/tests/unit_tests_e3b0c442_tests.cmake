add_test([=[ReplicationUnitTest.ReplIdManagerBasic]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=ReplicationUnitTest.ReplIdManagerBasic]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[ReplicationUnitTest.ReplIdManagerBasic]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\replication_test.cpp:8]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[ReplicationUnitTest.BacklogCircularWriteAndPartialResync]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=ReplicationUnitTest.BacklogCircularWriteAndPartialResync]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[ReplicationUnitTest.BacklogCircularWriteAndPartialResync]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\replication_test.cpp:24]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[ReplicationUnitTest.DeterministicCommandRewriting]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=ReplicationUnitTest.DeterministicCommandRewriting]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[ReplicationUnitTest.DeterministicCommandRewriting]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\replication_test.cpp:56]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[PersistenceTest.RdbRoundtripAllTypes]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=PersistenceTest.RdbRoundtripAllTypes]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[PersistenceTest.RdbRoundtripAllTypes]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\persistence_test.cpp:34]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[PersistenceTest.RdbCrcMismatchDetection]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=PersistenceTest.RdbCrcMismatchDetection]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[PersistenceTest.RdbCrcMismatchDetection]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\persistence_test.cpp:96]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[PersistenceTest.AofRewriteAndRecovery]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=PersistenceTest.AofRewriteAndRecovery]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[PersistenceTest.AofRewriteAndRecovery]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\persistence_test.cpp:115]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[EncodingTest.ListpackToQuicklistPromotion]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=EncodingTest.ListpackToQuicklistPromotion]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[EncodingTest.ListpackToQuicklistPromotion]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\encoding_test.cpp:4]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[EncodingTest.IntsetToHashtablePromotion]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=EncodingTest.IntsetToHashtablePromotion]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[EncodingTest.IntsetToHashtablePromotion]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\encoding_test.cpp:21]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[EncodingTest.ZSetListpackToSkiplistPromotion]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=EncodingTest.ZSetListpackToSkiplistPromotion]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[EncodingTest.ZSetListpackToSkiplistPromotion]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\encoding_test.cpp:40]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[SkiplistTest.BasicInsertAndScore]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=SkiplistTest.BasicInsertAndScore]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[SkiplistTest.BasicInsertAndScore]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\skiplist_test.cpp:4]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[SkiplistTest.RankAndRange]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=SkiplistTest.RankAndRange]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[SkiplistTest.RankAndRange]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\skiplist_test.cpp:19]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[SkiplistTest.RemoveMember]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=SkiplistTest.RemoveMember]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[SkiplistTest.RemoveMember]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\skiplist_test.cpp:35]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[TTLTest.LazyExpirationBasic]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=TTLTest.LazyExpirationBasic]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[TTLTest.LazyExpirationBasic]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\ttl_test.cpp:39]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[TTLTest.ExpireAndTTLCommands]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=TTLTest.ExpireAndTTLCommands]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[TTLTest.ExpireAndTTLCommands]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\ttl_test.cpp:60]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[TTLTest.ExpireOptionsNX_XX_GT_LT]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=TTLTest.ExpireOptionsNX_XX_GT_LT]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[TTLTest.ExpireOptionsNX_XX_GT_LT]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\ttl_test.cpp:93]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[TTLTest.SetCommandTTLOptions]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=TTLTest.SetCommandTTLOptions]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[TTLTest.SetCommandTTLOptions]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\ttl_test.cpp:129]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[TTLTest.ActiveExpireCycle]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=TTLTest.ActiveExpireCycle]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[TTLTest.ActiveExpireCycle]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\ttl_test.cpp:157]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[TTLTest.ReplicaModeBehavior]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=TTLTest.ReplicaModeBehavior]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[TTLTest.ReplicaModeBehavior]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\ttl_test.cpp:182]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[KeyspaceTest.MultiDatabaseIsolation]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=KeyspaceTest.MultiDatabaseIsolation]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[KeyspaceTest.MultiDatabaseIsolation]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\keyspace_test.cpp:7]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[RehashTest.ScanReverseBinaryCursorAcrossRehash]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=RehashTest.ScanReverseBinaryCursorAcrossRehash]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[RehashTest.ScanReverseBinaryCursorAcrossRehash]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\rehash_test.cpp:9]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[DictTest.BasicOperations]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=DictTest.BasicOperations]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[DictTest.BasicOperations]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\dict_test.cpp:9]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[DictTest.OneMillionInsertsWithForcedResize]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=DictTest.OneMillionInsertsWithForcedResize]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[DictTest.OneMillionInsertsWithForcedResize]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\dict_test.cpp:38]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[RespWriterTest.WriteSimpleString]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=RespWriterTest.WriteSimpleString]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[RespWriterTest.WriteSimpleString]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\resp_writer_test.cpp:10]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[RespWriterTest.WriteError]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=RespWriterTest.WriteError]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[RespWriterTest.WriteError]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\resp_writer_test.cpp:17]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[RespWriterTest.WriteInteger]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=RespWriterTest.WriteInteger]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[RespWriterTest.WriteInteger]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\resp_writer_test.cpp:24]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[RespWriterTest.WriteBulkString]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=RespWriterTest.WriteBulkString]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[RespWriterTest.WriteBulkString]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\resp_writer_test.cpp:31]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[RespWriterTest.WriteNullBulkAndArray]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=RespWriterTest.WriteNullBulkAndArray]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[RespWriterTest.WriteNullBulkAndArray]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\resp_writer_test.cpp:38]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[RespWriterTest.WriteStringArray]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=RespWriterTest.WriteStringArray]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[RespWriterTest.WriteStringArray]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\resp_writer_test.cpp:46]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[RespReaderTest.ParseMultibulkCommand]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=RespReaderTest.ParseMultibulkCommand]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[RespReaderTest.ParseMultibulkCommand]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\resp_reader_test.cpp:11]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[RespReaderTest.ParseInlineCommand]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=RespReaderTest.ParseInlineCommand]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[RespReaderTest.ParseInlineCommand]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\resp_reader_test.cpp:28]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[RespReaderTest.ByteAtATimeStreaming]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=RespReaderTest.ByteAtATimeStreaming]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[RespReaderTest.ByteAtATimeStreaming]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\resp_reader_test.cpp:46]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[RespReaderTest.PipelinedCommands]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=RespReaderTest.PipelinedCommands]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[RespReaderTest.PipelinedCommands]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\resp_reader_test.cpp:69]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[RespReaderTest.MalformedInputsReturnProtocolError]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=RespReaderTest.MalformedInputsReturnProtocolError]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[RespReaderTest.MalformedInputsReturnProtocolError]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\resp_reader_test.cpp:88]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[EventLoopTest.TimerExpiration]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=EventLoopTest.TimerExpiration]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[EventLoopTest.TimerExpiration]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\event_loop_test.cpp:10]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[EventLoopTest.CancelTimer]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=EventLoopTest.CancelTimer]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[EventLoopTest.CancelTimer]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\event_loop_test.cpp:28]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[TimeTest.SystemTimeProviderBasic]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=TimeTest.SystemTimeProviderBasic]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[TimeTest.SystemTimeProviderBasic]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\time_test.cpp:8]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[TimeTest.MockTimeProviderAdvancement]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=TimeTest.MockTimeProviderAdvancement]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[TimeTest.MockTimeProviderAdvancement]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\time_test.cpp:17]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[BufferTest.BasicAppendAndConsume]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=BufferTest.BasicAppendAndConsume]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[BufferTest.BasicAppendAndConsume]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\buffer_test.cpp:9]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[BufferTest.ReserveAndExpansion]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=BufferTest.ReserveAndExpansion]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[BufferTest.ReserveAndExpansion]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\buffer_test.cpp:29]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[BufferTest.AutomaticCompaction]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=BufferTest.AutomaticCompaction]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[BufferTest.AutomaticCompaction]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\buffer_test.cpp:39]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
add_test([=[BufferTest.ClearResetsCursors]=]  C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests/unit_tests.exe [==[--gtest_filter=BufferTest.ClearResetsCursors]==] --gtest_also_run_disabled_tests)
set_tests_properties([=[BufferTest.ClearResetsCursors]=]
  PROPERTIES
    
    DEF_SOURCE_LINE [==[C:\Users\prash\OneDrive\Desktop\pbRedisDB\tests\unit\buffer_test.cpp:60]==]
    WORKING_DIRECTORY [==[C:/Users/prash/OneDrive/Desktop/pbRedisDB/build_ucrt/tests]==]
    SKIP_REGULAR_EXPRESSION [==[\[  SKIPPED \]]==]
    
)
set(unit_tests_TESTS [==[ReplicationUnitTest.ReplIdManagerBasic]==] [==[ReplicationUnitTest.BacklogCircularWriteAndPartialResync]==] [==[ReplicationUnitTest.DeterministicCommandRewriting]==] [==[PersistenceTest.RdbRoundtripAllTypes]==] [==[PersistenceTest.RdbCrcMismatchDetection]==] [==[PersistenceTest.AofRewriteAndRecovery]==] [==[EncodingTest.ListpackToQuicklistPromotion]==] [==[EncodingTest.IntsetToHashtablePromotion]==] [==[EncodingTest.ZSetListpackToSkiplistPromotion]==] [==[SkiplistTest.BasicInsertAndScore]==] [==[SkiplistTest.RankAndRange]==] [==[SkiplistTest.RemoveMember]==] [==[TTLTest.LazyExpirationBasic]==] [==[TTLTest.ExpireAndTTLCommands]==] [==[TTLTest.ExpireOptionsNX_XX_GT_LT]==] [==[TTLTest.SetCommandTTLOptions]==] [==[TTLTest.ActiveExpireCycle]==] [==[TTLTest.ReplicaModeBehavior]==] [==[KeyspaceTest.MultiDatabaseIsolation]==] [==[RehashTest.ScanReverseBinaryCursorAcrossRehash]==] [==[DictTest.BasicOperations]==] [==[DictTest.OneMillionInsertsWithForcedResize]==] [==[RespWriterTest.WriteSimpleString]==] [==[RespWriterTest.WriteError]==] [==[RespWriterTest.WriteInteger]==] [==[RespWriterTest.WriteBulkString]==] [==[RespWriterTest.WriteNullBulkAndArray]==] [==[RespWriterTest.WriteStringArray]==] [==[RespReaderTest.ParseMultibulkCommand]==] [==[RespReaderTest.ParseInlineCommand]==] [==[RespReaderTest.ByteAtATimeStreaming]==] [==[RespReaderTest.PipelinedCommands]==] [==[RespReaderTest.MalformedInputsReturnProtocolError]==] [==[EventLoopTest.TimerExpiration]==] [==[EventLoopTest.CancelTimer]==] [==[TimeTest.SystemTimeProviderBasic]==] [==[TimeTest.MockTimeProviderAdvancement]==] [==[BufferTest.BasicAppendAndConsume]==] [==[BufferTest.ReserveAndExpansion]==] [==[BufferTest.AutomaticCompaction]==] [==[BufferTest.ClearResetsCursors]==])
