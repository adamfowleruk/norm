xquery version "1.0-ml";
declare namespace n = 'http://marklogic.com/norm/main';

xdmp:document-insert("/admin/config/norm-test.xml",<n:denormalisation>
 <n:name>basic programme info</n:name>
 <n:description>Basic programme information test denormalisation</n:description>
 <n:uri-pattern>/prog-avail/##s1:pk##-##s4:pk:1##-##s4:pk:2##.xml</n:uri-pattern>
 <n:collections>norm-generated,prog-avail-1</n:collections>
 <n:enabled>true</n:enabled>
 <n:namespaces>
  <n:namespace prefix="tv">http://marklogic.com/norm/ns/tv</n:namespace>
  <n:namespace prefix="pa">http://marklogic.com/norm/ns/prog-avail</n:namespace>
 </n:namespaces>
 <n:template>
  <n:element ns="pa" name="programme-availability">
   <n:element ns="tv" name="episode" source="s1" source-path="/tv:episode/*" />
   
   <n:element ns="tv" name="availability" source="s4" source-path="/tv:availability/*" />
   
   <n:element ns="tv" name="series" source="s2" source-path="/tv:series/*" />
   
   <n:element name="blanknstest"><n:static>Some static text</n:static></n:element>
  </n:element>
 </n:template>
 
 <n:sources>
  <n:source id="s1" name="episode" root-xpath="fn:collection(""episodes"")" mode="create-update" required="true">
   <n:collection-match>episodes</n:collection-match>
   <n:primary-key><n:ns>tv</n:ns><n:element>episode</n:element><n:attribute>pid</n:attribute></n:primary-key>
  </n:source>
  <n:source id="s2" name="series" root-xpath="fn:collection(""series"")" mode="create-update" required="false">
   <n:collection-match>series</n:collection-match>
   <n:primary-key><n:ns>tv</n:ns><n:element>series</n:element><n:attribute>pid</n:attribute></n:primary-key>
   <n:foreign-key primary-entity="s1" key-ns="tv" key-element="episode" key-attribute="pid"><n:ns>tv</n:ns><n:element>series</n:element><n:attribute>episode-pid</n:attribute></n:foreign-key>
  </n:source>
  <n:source id="s4" name="availability" root-xpath="fn:uris(""/availabilities/*"")" mode="create-update" required="true">
   <n:collection-match>availabilities</n:collection-match>
   <n:foreign-key primary-entity="s1" key-ns="tv" key-element="episode" key-attribute="pid"><n:ns>tv</n:ns><n:element>availability</n:element><n:attribute>episode-pid</n:attribute></n:foreign-key>
   <n:primary-key order="1"><n:ns>tv</n:ns><n:element>start-time</n:element></n:primary-key>
   <n:primary-key order="2"><n:ns>tv</n:ns><n:element>end-time</n:element></n:primary-key>

  </n:source> 
 </n:sources>
</n:denormalisation>,
xdmp:default-permissions(),"norm-config"
)