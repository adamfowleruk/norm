xquery version "1.0-ml";
declare namespace n = 'http://marklogic.com/norm/main';

xdmp:document-insert("/admin/config/norm-test.xml",<n:denormalisation>
 <n:name>basic programme info</n:name>
 <n:description>Basic programme information test denormalisation</n:description>
 <n:uri-pattern>/prog-avail/##s1:pk##-##s4:pk:1##-##s4:pk:2##.xml</n:uri-pattern>
 <n:collections>norm-generated,prog-avail-1</n:collections>
 <n:enabled>true</n:enabled>
 <n:template>
  <n:element name="programme-availability">
   <n:element name="episode" source="s1" source-path="/episode/*" />
   
   <n:element name="availability" source="s4" source-path="/availability/*" />
   
   <n:element name="series" source="s2" source-path="/series/*" />
   
   <n:element name="brand" source="s3" source-path="/brand/*" />
  </n:element>
 </n:template>
 
 <n:sources>
  <n:source id="s1" name="episode" root-xpath="fn:collection(""episodes"")" mode="create-update" required="true">
   <n:collection-match>episodes</n:collection-match>
   <n:primary-key><n:element>episode</n:element><n:attribute>pid</n:attribute></n:primary-key>
  </n:source>
  <n:source id="s2" name="series" root-xpath="fn:collection(""series"")" mode="create-update" required="false">
   <n:collection-match>series</n:collection-match>
   <n:primary-key><n:element>series</n:element><n:attribute>pid</n:attribute></n:primary-key>
   <n:foreign-key primary-entity="s1" key-element="episode" key-attribute="pid"><n:element>series</n:element><n:attribute>episode-pid</n:attribute></n:foreign-key>
  </n:source>
  <n:source id="s3" name="brand" root-xpath="fn:collection(""brand"")" mode="create-update" required="false">
   <n:collection-match>brand</n:collection-match>
   <n:primary-key><n:element>brand</n:element><n:attribute>pid</n:attribute></n:primary-key>
   <n:foreign-key primary-entity="s2" key-element="series" key-attribute="pid"><n:element>brand</n:element><n:attribute>series-pid</n:attribute></n:foreign-key>
  </n:source>
  <n:source id="s4" name="availability" root-xpath="fn:uris(""/availabilities/*"")" mode="create-update" required="true">
   <n:collection-match>availabilities</n:collection-match>
   <n:foreign-key primary-entity="s1" key-element="episode" key-attribute="pid"><n:element>availability</n:element><n:attribute>episode-pid</n:attribute></n:foreign-key>
   <n:primary-key order="1"><n:element>start-time</n:element></n:primary-key>
   <n:primary-key order="2"><n:element>end-time</n:element></n:primary-key>

  </n:source> 
 </n:sources>
</n:denormalisation>,
xdmp:default-permissions(),"norm-config"
)